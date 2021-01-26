/**
 * This is a mockserver for OData V4. Some parts of this mockserver were taken from
 * https://sapui5.hana.ondemand.com/#/entity/sap.ui.core.tutorial.odatav4
 *
 * Since sap/ui/core/util/MockServer doesn't work for OData V4, use this until the core UI5 comes
 * with a V4 version of that MockServer; however, this version is not as good as that one, and so
 * there might need to be some adjustments and certain use cases that are not functioning properly.
 *
 * This version is more generic, and is given an array of mock service objects as input. This could be reused
 * in other projects, with different services. Knowledge about the services should be limited to the `aServices`
 * variable declared at the beginning. The rest of the code should be agnostic of the service.
 *
 * This mockserver supports:
 * 1) Multiple OData services, each having separate metadata.xml
 * 2) Arbitrary entities, arbitrary field sorting/filtering
 * 3) Simple navigation properties
 * 4) Hard coded function import responses
 * 5) Uses the LoaderExtensions to download JSON/xml, allowing for mock data to be preloaded
 */
sap.ui.define(
  [
    "sap/ui/thirdparty/sinon",
    "sap/base/Log",
    "sap/base/util/LoaderExtensions",
    "sap/ui/core/format/DateFormat"
  ],
  function (sinon, Log, LoaderExtensions, DateFormat) {
    var oSandbox = sinon.sandbox.create(),
      iDelayResponseMS = 1000, // delay in MS for mock Requests
      sLogComponent = "sandbox.test.localService.mockserver",
      aServices = (window.__mockservices = [
        {
          rBaseUrl: /\/odata\/v4\/Sample.svc/,
          sNamespace: "sandbox/test/localService/Sample.svc/",
          sBaseUrl: window.location.origin + "/odata/v4/Sample.svc/",
          aMocks: [
            {
              rUrl: /\/\$metadata(\?.*|)$/,
              sResource: "metadata.xml",
              sType: "simple",
              sMethod: "GET"
            },
            {
              rUrl: /\/Person(\(.*\)|)(\?.*|)$/,
              sResource: "data/Person.json",
              sType: "jsonMock",
              sEntityName: "Person",
              sEntityKey: "personId"
            }
          ]
        }
      ]);

    // Copy this file, change the mocks above, and maintain the json/xml files separately
    // NOTHING BELOW THIS LINE SHOULD NEED TO CHANGE
    /* eslint-disable max-nested-callbacks */

    return {
      /**
       * Creates a Sinon fake service, intercepting all http requests to
       * the URL defined in variable sBaseUrl above.
       * @returns{Promise} a promise that is resolved when the mock server is started
       */
      init: function () {
        // Read the mock data
        return readData().then(function () {
          // Initialize the sinon fake server
          oSandbox.useFakeServer();
          // Make sure that requests are responded to automatically. Otherwise we would need to do that manually.
          oSandbox.server.autoRespond = true;
          oSandbox.server.autoRespondAfter = iDelayResponseMS;

          // Register the requests for which responses should be faked.
          aServices.forEach(function (oService) {
            oSandbox.server.respondWith(oService.rBaseUrl, function (oXhr) {
              return handleAllRequests(oService, oXhr);
            });
          });

          // Apply a filter to the fake XmlHttpRequest.
          // Otherwise, ALL requests (e.g. for the component, views etc.) would be intercepted.
          sinon.FakeXMLHttpRequest.useFilters = true;
          sinon.FakeXMLHttpRequest.addFilter(function (sMethod, sUrl) {
            return !aServices.some(function (oService) {
              return oService.rBaseUrl.test(sUrl);
            });
          });

          // Set the logging level for console entries from the mock server
          Log.setLevel(3, sLogComponent);

          Log.info("Running the app with mock data", sLogComponent);
        });
      },

      /**
       * Stops the request interception and deletes the Sinon fake server.
       */
      stop: function () {
        sinon.FakeXMLHttpRequest.filters = [];
        sinon.FakeXMLHttpRequest.useFilters = false;
        oSandbox.restore();
        oSandbox = null;
      }
    };

    /**
     * Read the data for one mock object.
     * @param {Object} oService The service
     * @param {Object} oMock the mock
     * @return {Promise} A promise
     */
    function readDataForMock(oService, oMock) {
      // Check if the oMock has data already defined
      if (oMock.oData) {
        oMock.sResponseText =
          oMock.sResponseText || JSON.stringify(oMock.oData);
        return Promise.resolve();
      }
      if (oMock.sType == "function") {
        return Promise.resolve();
      }
      if (oMock.sResponseText) {
        if (oMock.sType == "jsonMock") {
          oMock.oData = JSON.parse(oMock.sResponseText);
        }
        return Promise.resolve();
      }
      return LoaderExtensions.loadResource(
        oService.sNamespace + oMock.sResource,
        {
          async: true
        }
      ).then(function (oData) {
        oMock.oData = oData;
        if (oData.documentElement) {
          oMock.sResponseText = new XMLSerializer().serializeToString(
            oData.documentElement
          );
        } else if (oData && typeof oData == "object") {
          oMock.sResponseText = JSON.stringify(oData);
        } else {
          oMock.sResponseText = "" + oData;
        }
        if (oMock.sType == "jsonMock" && typeof oData == "string") {
          oMock.oData = JSON.parse(oData);
        }
      });
    }

    /**
     * Read all the mock data from each of the services.
     * @inner
     * @return {Promise} Resolved when all mock data has been read successfully.
     */
    function readData() {
      return Promise.all(
        aServices.map(function (oService) {
          oService.oMockLookup = {};
          return Promise.all(
            oService.aMocks.map(function (oMock) {
              return readDataForMock(oService, oMock).then(function () {
                oMock.oService = oService;
                if (oMock.sType == "jsonMock") {
                  oService.oMockLookup[oMock.sEntityName] = oMock;
                }
              });
            })
          );
        })
      );
    }

    /**
     * Get a basic response given the status code, content type, and response body as a string.
     * @param {Integer} iStatusCode The status code, i.e. 200, 404, etc.
     * @param {String} sContentType The content type
     * @param {String} sResponseBody The response body as string
     * @return {Array} A response array
     */
    function basicResponse(iStatusCode, sContentType, sResponseBody) {
      var oResponseHeaders = {
        "odata-version": "4.0"
      };
      if (sContentType) {
        oResponseHeaders["Content-Type"] = sContentType;
      }
      return [iStatusCode, oResponseHeaders, sResponseBody];
    }

    function decorate(oJsonData, oDecorations) {
      var sResponseText,
        sJsonData,
        sDecoration,
        aParts,
        rJsonBody = /^\{(.*)\}$/;

      if (oJsonData) {
        sJsonData =
          typeof oJsonData == "string" ? oJsonData : JSON.stringify(oJsonData);
        sDecoration =
          typeof oDecorations == "string"
            ? oDecorations
            : JSON.stringify(oDecorations);
        aParts = rJsonBody.exec(sJsonData);
        if (aParts) {
          sJsonData = aParts[1];
          aParts = rJsonBody.exec(sDecoration);
          if (aParts) {
            sDecoration = aParts[1];
            sResponseText =
              "{" +
              sDecoration +
              (sDecoration && sJsonData && ",") +
              sJsonData +
              "}";
          }
        }
      }

      if (!sResponseText) {
        throw new Error("Invalid decoration");
      }

      return sResponseText;
    }

    /**
     *
     * @param {Object} oJsonData The json data object
     * @param {Object} oDecorations Additional properties to decorate the object
     * @param {Integer=} iStatusCode The status code, default 200
     * @return {Array} A response array
     */
    function jsonResponseDecorated(oJsonData, oDecorations, iStatusCode) {
      return jsonResponse(decorate(oJsonData, oDecorations));
    }

    /**
     * Get a standard json response.
     *
     * @param {String|Object} oJsonData Either the Object or the JSON string.
     * @param {Integer=} iStatusCode Optional status code, 200 is default.
     * @return {Array} A response array
     */
    function jsonResponse(oJsonData, iStatusCode) {
      var sResponseText =
        typeof oJsonData == "string" ? oJsonData : JSON.stringify(oJsonData);
      return basicResponse(
        iStatusCode || 200,
        "application/json; odata.metadata=minimal",
        sResponseText
      );
    }

    /**
     * Generate an error response.
     * @param {Integer} iStatusCode Status code such as 404, or 500
     * @param {String} sErrorMessage The error message
     * @param {String=} sErrorTarget The target property name for the error message
     * @return {Array} A response array
     */
    function getErrorResponse(iStatusCode, sErrorMessage, sErrorTarget) {
      var oMessage = {
        lang: "en-US",
        value: sErrorMessage
      };
      if (sErrorTarget) {
        oMessage.target = sErrorTarget;
      }
      return jsonResponse(
        {
          error: {
            code: iStatusCode + "",
            message: oMessage
          }
        },
        iStatusCode
      );
    }

    /**
     * Handle a simple mock request, which will reply with a hard coded response text.
     *
     * @param {Object} oMock The simple mock object
     * @param {String} oMock.sResource The resource this mock text is loaded from
     * @param {String} oMock.sResponseText The text obtained during readData for this resource
     * @return {Array} A response array
     */
    function handleSimpleRequest(oMock) {
      return basicResponse(
        200,
        {
          xml: "application/xml",
          json: "application/json; charset=utf-8"
        }[/\.(\w+)$/.exec(oMock.sResource)[1]],
        oMock.sResponseText
      );
    }

    /**
     * Retrieves the key from a given request URL.
     * @param {string} sUrl - the request URL.
     * @returns {string} the key
     */
    function getEntityKeyFromUrl(sUrl) {
      var aMatches = sUrl.match(/\('?([^'\)]*)'?\)(?:\?.*|)$/);
      if (!Array.isArray(aMatches) || aMatches.length !== 2) {
        throw new Error("Could not find a key in " + sUrl);
      }
      return aMatches[1];
    }

    /**
     * Looks for an entity with a given entity key and returns its index in the entity array.
     * @param {Object} oMock The mock
     * @param {String} oMock.sEntityKey The key
     * @param {Object} oMock.oData The data
     * @param {String} sEntityKey - the entity key to look for.
     * @returns {Integer} index of that entity in the array, or -1 if the entity was not found.
     */
    function findEntityIndex(oMock, sEntityKey) {
      var aData = oMock.oData.value;
      for (var i = 0; i < aData.length; i++) {
        if (aData[i][oMock.sEntityKey] === sEntityKey) {
          return i;
        }
      }
      return -1;
    }

    /**
     * Filters a given result set by applying the OData URL parameter 'filter'.
     * Does NOT change the given result set but returns a new array.
     * @param {Object} oXhr - the Sinon fake XMLHttpRequest
     * @param {Array} aResultSet - the result set to be filtered.
     * @returns {Array} the filtered result set.
     */
    function applyFilter(oXhr, aResultSet) {
      var sFieldName,
        sQuery,
        aFilteredEntities,
        aMatches = oXhr.url.match(/\$filter=.*\((.*),'(.*)'\)/);

      // If the request contains a filter command, apply the filter
      if (Array.isArray(aMatches) && aMatches.length >= 3) {
        sFieldName = aMatches[1];
        sQuery = aMatches[2];

        if (!/^\w+$/.test(sFieldName)) {
          throw new Error(
            "Filters on field " + sFieldName + " are not supported."
          );
        }

        aFilteredEntities = aResultSet.filter(function (oEntity) {
          return oEntity[sFieldName].indexOf(sQuery) !== -1;
        });
      } else {
        aFilteredEntities = aResultSet.concat([]);
      }

      return aFilteredEntities;
    }

    /**
     * Sorts a given result set by applying the OData URL parameter 'orderby'.
     * Does NOT change the given result set but returns a new array.
     * @param {Object} oXhr - the Sinon fake XMLHttpRequest
     * @param {Array} aResultSet - the result set to be sorted.
     * @returns {Array} the sorted result set.
     */
    function applySort(oXhr, aResultSet) {
      var sFieldName,
        sDirection,
        aSortedEntities = [].concat(aResultSet), // work with a copy
        aMatches = oXhr.url.match(/\$orderby=(\w*)(?:%20(\w*))?/);

      if (!Array.isArray(aMatches) || aMatches.length < 2) {
        return aSortedEntities;
      } else {
        sFieldName = aMatches[1];
        sDirection = aMatches[2] || "asc";

        if (!/^\w+$/.test(sFieldName)) {
          throw new Error(
            "Filters on field " + sFieldName + " are not supported."
          );
        }

        aSortedEntities.sort(function (a, b) {
          var nameA = a[sFieldName].toUpperCase();
          var nameB = b[sFieldName].toUpperCase();
          var bAsc = sDirection === "asc";

          if (nameA < nameB) {
            return bAsc ? -1 : 1;
          }
          if (nameA > nameB) {
            return bAsc ? 1 : -1;
          }
          return 0;
        });

        return aSortedEntities;
      }
    }

    /**
     * Apply the OData expand to the given entity.
     * @param {Object} oXhr The Faked request
     * @param {Object} oMock The mock
     * @param {Object} oEntity The entity from the mock
     * @returns {Object} An object used to decorate this object with the expanded properties
     */
    function expandedFieldDecorations(oXhr, oMock, oEntity) {
      var oDecorations = {},
        aParts,
        sExpand;

      if (oMock.oNavigations) {
        aParts = /\$expand=([^&#]*)/.exec(oXhr.url);
        sExpand = aParts && aParts[1];
        if (sExpand) {
          sExpand
            .split(",")
            .map(function (a) {
              return decodeURIComponent(a).trim();
            })
            .forEach(function (sFieldName) {
              var oNavigation = oMock.oNavigations[sFieldName],
                oFieldMock,
                iEntityIndex;
              if (oNavigation) {
                oFieldMock =
                  oMock.oService.oMockLookup[oNavigation.sEntityName];
                if (oFieldMock) {
                  iEntityIndex = findEntityIndex(
                    oFieldMock,
                    oEntity[oNavigation.sFieldName]
                  );
                  if (iEntityIndex > -1) {
                    oDecorations[sFieldName] =
                      oFieldMock.oData.value[iEntityIndex];
                  }
                }
              }
            });
        }
      }

      return oDecorations;
    }

    /**
     * Reduces a given result set by applying the OData URL parameters 'skip' and 'top' to it.
     * Does NOT change the given result set but returns a new array.
     * @param {Object} oXhr - the Sinon fake XMLHttpRequest
     * @param {Array} aResultSet - the result set to be reduced.
     * @returns {Array} the reduced result set.
     */
    function applySkipTop(oXhr, aResultSet) {
      var iSkip,
        iTop,
        oReducedEntities = [].concat(aResultSet),
        aMatches = oXhr.url.match(/\$skip=(\d+)&\$top=(\d+)/);

      if (Array.isArray(aMatches) && aMatches.length >= 3) {
        iSkip = aMatches[1];
        iTop = aMatches[2];
        return aResultSet.slice(iSkip, iSkip + iTop);
      }

      return oReducedEntities;
    }

    /**
     * Checks if a given Entity Key is unique or already used
     * @param {Object} oMock The mock data
     * @param {string} sEntityKey - the Entity Key to be checked
     * @returns {boolean} True if the Entity Key is unique (not used), false otherwise
     */
    function isUnique(oMock, sEntityKey) {
      return findEntityIndex(oMock, sEntityKey) < 0;
    }

    /**
     * Create the base object to use for decorating an Entity JSON object.
     * @param {Object} oMock The mock data
     * @returns {Object} The base decorations to use.
     */
    function baseDecorations(oMock) {
      var sContext =
        oMock.oService.sBaseUrl +
        "$metadata#" +
        oMock.sEntityName +
        "(" +
        oMock.sEntityKey +
        ")/$entity";
      return {
        "@odata.context": sContext
      };
    }

    /**
     * Retrieves any entity data from a given http request body.
     * @param {string} sBody - the http request body.
     * @returns {Object} the parsed entity data.
     */
    function getEntityDataFromRequest(sBody) {
      var aMatches = sBody.match(/({.*})/);
      if (!Array.isArray(aMatches) || aMatches.length !== 2) {
        throw new Error("Could not find any entity data in " + sBody);
      }
      return JSON.parse(aMatches[1]);
    }

    /**
     * Handles GET requests for entity data and returns a fitting response.
     * @param {Object} oMock The Mock object
     * @param {Object} oXhr - the Sinon fake XMLHttpRequest
     * @returns {Array} an array with the response information needed by Sinon's respond() function
     */
    function handleEntityRequest(oMock, oXhr) {
      var iCount,
        sKey,
        iIndex,
        aResult,
        oEntity,
        oDecorations = baseDecorations(oMock);

      // Check if an individual entity or a entity range is requested
      try {
        sKey = getEntityKeyFromUrl(oXhr.url); // If this throws an error, then a entity range was requested

        iIndex = findEntityIndex(oMock, sKey);
        if (iIndex > -1) {
          oEntity = oMock.oData.value[iIndex];
          Object.assign(
            oDecorations,
            expandedFieldDecorations(oXhr, oMock, oEntity)
          );
          aResult = jsonResponseDecorated(oEntity, oDecorations);
        } else {
          aResult = invalidKeyError(oMock, sKey);
        }
      } catch (oException) {
        // If getEntityKeyFromUrl throws an error, then a entity range was requested
        // Get the data filtered, sorted and reduced according to skip + top
        aResult = applyFilter(oXhr, oMock.oData.value);
        iCount = aResult.length; // the total no. of people found, after filtering
        aResult = applySort(oXhr, aResult);
        aResult = applySkipTop(oXhr, aResult);

        if (/\$count/.test(oXhr.url)) {
          oDecorations["@odata.content"] = iCount;
        }

        aResult = jsonResponseDecorated(
          '{"value":[' +
            aResult
              .map(function (oEntity) {
                return decorate(
                  oEntity,
                  expandedFieldDecorations(oXhr, oMock, oEntity)
                );
              })
              .join(",") +
            "]}",
          oDecorations
        );
      }

      return aResult;
    }

    /**
     * Returns a proper HTTP response body for "duplicate key" errors
     * @param {Object} oMock The mock data
     * @param {string} sKey - the duplicate key
     * @returns {string} the proper response body
     */
    function duplicateKeyError(oMock, sKey) {
      var sErrorMessage =
        "There is already a(n) " +
        oMock.sEntityName +
        " with " +
        oMock.sEntityKey +
        " '" +
        sKey +
        "'.";
      return getErrorResponse(400, sErrorMessage);
    }

    /**
     * Returns a proper HTTP response body for "invalid key" errors
     * @param {Object} oMock The mock data
     * @param {string} sKey - the invalid key
     * @returns {string} the proper response body
     */
    function invalidKeyError(oMock, sKey) {
      return getErrorResponse(
        404,
        "Cannot find " +
          oMock.sEntityName +
          " with " +
          oMock.sEntityKey +
          " '" +
          sKey +
          "'",
        oMock.sEntityKey
      );
    }

    /**
     * Handles PATCH requests for entities and returns a fitting response.
     * Changes the entity data according to the request.
     * @param {Object} oMock The mock data
     * @param {Object} oXhr the Sinon fake XMLHttpRequest
     * @returns {Array} an array with the response information needed by Sinon's respond() function
     */
    function handlePatchRequest(oMock, oXhr) {
      var sKey, oEntity, oChanges, aResponse, iEntityIndex;

      // Get the key of the person to change
      sKey = getEntityKeyFromUrl(oXhr.url);

      // Get the list of changes
      oChanges = getEntityDataFromRequest(oXhr.requestBody);

      // Check if the Entity Key is changed to a duplicate.
      // If the Entity Key is "changed" to its current value, that is not an error.
      if (
        oChanges.hasOwnProperty(oMock.sEntityKey) &&
        oChanges[oMock.sEntityKey] !== sKey &&
        !isUnique(oMock, oChanges[oMock.sEntityKey])
      ) {
        aResponse = duplicateKeyError(oMock, sKey);
      } else {
        iEntityIndex = findEntityIndex(oMock, sKey);

        if (iEntityIndex > -1) {
          // No error: make the change(s)
          oEntity = oMock.oData.value[findEntityIndex(oMock, sKey)];
          for (var sFieldName in oChanges) {
            if (oChanges.hasOwnProperty(sFieldName)) {
              oEntity[sFieldName] = oChanges[sFieldName];
            }
          }

          if (oMock.fEntityDecorator) {
            oMock.fEntityDecorator(oEntity);
          }

          // The response to PATCH requests is always http 204 (No Content)
          aResponse = basicResponse(204);
        } else {
          aResponse = invalidKeyError(oMock, sKey);
        }
      }

      return aResponse;
    }

    /**
     * Handles DELETE requests for entities and returns a fitting response.
     * Deletes the entity according to the request.
     * @param {Object} oMock The mock data
     * @param {Object} oXhr - the Sinon fake XMLHttpRequest
     * @returns {Array} an array with the response information needed by Sinon's respond() function
     */
    function handleDeleteRequest(oMock, oXhr) {
      var sKey, iEntityIndex;

      sKey = getEntityKeyFromUrl(oXhr.url);
      iEntityIndex = findEntityIndex(oMock, sKey);

      if (iEntityIndex >= 0) {
        oMock.oData.value.splice(iEntityIndex, 1);
      }

      // The response to DELETE requests is always http 204 (No Content)
      return basicResponse(204);
    }

    /**
     * Builds a response to a /$count request.
     * @param {Object} oMock The mock data
     * @returns {Array} an array with the response information needed by Sinon's respond() function
     */
    function handleCountRequest(oMock) {
      return basicResponse(200, null, oMock.oData.value.length.toString());
    }

    /**
     * Builds a response to direct (= non-batch) requests.
     * Supports GET, PATCH, DELETE and POST requests.
     * @param {Object} oService The service
     * @param {Object} oXhr - the Sinon fake XMLHttpRequest
     * @returns {Array} an array with the response information needed by Sinon's respond() function
     */
    function handleDirectRequest(oService, oXhr) {
      var aResponse;

      try {
        if (
          !oService.aMocks.some(function (oMock) {
            if (oMock.rUrl.test(oXhr.url)) {
              switch (oMock.sType) {
                case "simple":
                  aResponse = handleSimpleRequest(oMock);
                  break;
                case "function":
                  aResponse = oMock.fHandler(
                    getEntityDataFromRequest(oXhr.requestBody)
                  );
                  if (!Array.isArray(aResponse)) {
                    aResponse = jsonResponse(aResponse);
                  }
                  break;
                case "jsonMock":
                  switch (oXhr.method) {
                    case "GET":
                      if (/\/\$count/.test(oXhr.url)) {
                        aResponse = handleCountRequest(oMock, oXhr);
                      } else {
                        aResponse = handleEntityRequest(oMock, oXhr);
                      }
                      break;
                    case "PATCH":
                      aResponse = handlePatchRequest(oMock, oXhr);
                      break;
                    case "POST":
                      aResponse = handlePostRequest(oMock, oXhr);
                      break;
                    case "DELETE":
                      aResponse = handleDeleteRequest(oMock, oXhr);
                      break;
                    default:
                      aResponse = getErrorResponse(405, "Invalid method");
                      break;
                  }
                  break;
                default:
                  throw new Error("Invalid mock type: " + oMock.sType);
              }
            }
            return !!aResponse;
          })
        ) {
          aResponse = getErrorResponse(404, "Service not found: " + oXhr.url);
        }
      } catch (e) {
        console.error(e);
        aResponse = getErrorResponse(500, e.message);
      }
      return aResponse;
    }

    /**
     * Handles POST requests for entity and returns a fitting response.
     * Creates a new entity according to the request.
     * @param {Object} oMock The mock data
     * @param {Object} oXhr - the Sinon fake XMLHttpRequest
     * @returns {Array} an array with the response information needed by Sinon's respond() function
     */
    function handlePostRequest(oMock, oXhr) {
      var oEntity = getEntityDataFromRequest(oXhr.requestBody),
        aResponse;

      if (
        !oEntity.hasOwnProperty(oMock.sEntityKey) &&
        oMock.fEntityKeyGenerator
      ) {
        oEntity[oMock.sEntityKey] = oMock.fEntityKeyGenerator();
      }

      // Check if that entity already exists
      if (isUnique(oMock, oEntity[oMock.sEntityKey])) {
        if (oMock.fEntityDecorator) {
          oMock.fEntityDecorator(oEntity);
        }
        oMock.oData.value.push(oEntity);

        // The response to POST requests is http 201 (Created)
        aResponse = jsonResponseDecorated(oEntity, baseDecorations(oMock), 201);
      } else {
        // Error
        aResponse = duplicateKeyError(oMock, oEntity[oMock.sEntityKey]);
      }

      return aResponse;
    }

    /**
     * Builds a response to batch requests.
     * Unwraps batch request, gets a response for each individual part and
     * constructs a fitting batch response.
     * @param {Object} oService The service
     * @param {Object} oXhr - the Sinon fake XMLHttpRequest
     * @returns {Array} an array with the response information needed by Sinon's respond() function
     */
    function handleBatchRequest(oService, oXhr) {
      var aResponse,
        sResponseBody = "",
        sOuterBoundary = oXhr.requestBody.match(/(.*)/)[1], // First line of the body
        sInnerBoundary,
        sPartBoundary,
        aOuterParts = oXhr.requestBody.split(sOuterBoundary).slice(1, -1), // The individual requests
        aParts,
        aMatches;

      aMatches = aOuterParts[0].match(/multipart\/mixed;boundary=(.+)/);
      // If this request has several change sets, then we need to handle the inner and outer boundaries
      // (change sets have an additional boundary)
      if (aMatches && aMatches.length > 0) {
        sInnerBoundary = aMatches[1];
        aParts = aOuterParts[0].split("--" + sInnerBoundary).slice(1, -1);
      } else {
        aParts = aOuterParts;
      }

      // If this request has several change sets, then the response must start with the outer boundary and
      // content header
      if (sInnerBoundary) {
        sPartBoundary = "--" + sInnerBoundary;
        sResponseBody +=
          sOuterBoundary +
          "\r\n" +
          "Content-Type: multipart/mixed; boundary=" +
          sInnerBoundary +
          "\r\n\r\n";
      } else {
        sPartBoundary = sOuterBoundary;
      }

      aParts.forEach(function (sPart, iIndex) {
        // Construct the batch response body out of the single batch request parts.
        // The RegExp looks for a request body at the end of the string, framed by two line breaks.
        var aMatches = sPart.match(
          /(GET|DELETE|PATCH|POST) (\S+)(?:.|\r?\n)+\r?\n(.*)\r?\n$/
        );
        var aPartResponse = handleDirectRequest(oService, {
          method: aMatches[1],
          url: oService.sBaseUrl + aMatches[2],
          requestBody: aMatches[3]
        });
        sResponseBody +=
          sPartBoundary + "\r\n" + "Content-Type: application/http\r\n";
        // If there are several change sets, we need to add a Content ID header
        if (sInnerBoundary) {
          sResponseBody += "Content-ID:" + iIndex + ".0\r\n";
        }
        sResponseBody += "\r\nHTTP/1.1 " + aPartResponse[0] + "\r\n";
        // Add any headers from the request - unless this response is 204 (no content)
        if (aPartResponse[1] && aPartResponse[0] !== 204) {
          for (var sHeader in aPartResponse[1]) {
            if (aPartResponse[1].hasOwnProperty(sHeader)) {
              sResponseBody +=
                sHeader + ": " + aPartResponse[1][sHeader] + "\r\n";
            }
          }
        }
        sResponseBody += "\r\n";

        if (aPartResponse[2]) {
          sResponseBody += aPartResponse[2];
        }
        sResponseBody += "\r\n";
      });

      // Check if we need to add the inner boundary again at the end
      if (sInnerBoundary) {
        sResponseBody += "--" + sInnerBoundary + "--\r\n";
      }
      // Add a final boundary to the batch response body
      sResponseBody += sOuterBoundary + "--";

      // Build the final batch response
      aResponse = basicResponse(
        200,
        "multipart/mixed;boundary=" + sOuterBoundary.slice(2),
        sResponseBody
      );

      return aResponse;
    }

    /**
     * Handles any type of intercepted request and sends a fake response.
     * Logs the request and response to the console.
     * Manages batch requests.
     * @param {Object} oService The service
     * @param {Object} oXhr - the Sinon fake XMLHttpRequest
     */
    function handleAllRequests(oService, oXhr) {
      var aResponse;

      // Log the request
      Log.info(
        "Mockserver: Received " + oXhr.method + " request to URL " + oXhr.url,
        (oXhr.requestBody
          ? "Request body is:\n" + oXhr.requestBody
          : "No request body.") + "\n",
        sLogComponent
      );

      if (oXhr.method === "POST" && /\$batch$/.test(oXhr.url)) {
        aResponse = handleBatchRequest(oService, oXhr);
      } else {
        aResponse = handleDirectRequest(oService, oXhr);
      }

      oXhr.respond(aResponse[0], aResponse[1], aResponse[2]);

      // Log the response
      Log.info(
        "Mockserver: Sent response with return code " + aResponse[0],
        "Response headers: " +
          JSON.stringify(aResponse[1]) +
          "\n\nResponse body:\n" +
          aResponse[2] +
          "\n",
        sLogComponent
      );
    }
  }
);

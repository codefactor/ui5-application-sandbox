sap.ui.define(["sap/m/MessageBox", "./localService/mockserver"], function (
  MessageBox,
  mockserver
) {
  "use strict";
  // initialize the mock server
  mockserver
    .init()
    .catch(function (oError) {
      MessageBox.error(oError.message);
    })
    .finally(function () {
      // initialize the embedded component on the HTML page
      sap.ui.require(["sap/ui/core/ComponentSupport"]);
    });
});

sap.ui.define(["sap/ui/core/mvc/Controller"], function (Controller) {
  "use strict";
  return Controller.extend("sandbox.App", {
    ok: function () {
      this.getDialog().open();
    },
    close: function () {
      var oDialog = this.getDialog(true);
      if (oDialog) {
        oDialog.close();
      }
    },
    getDialog: function (noCreate) {
      if (!noCreate && !this.oDialog) {
        var oView = this.getView();
        this.oDialog = sap.ui.xmlfragment(
          oView.getId(),
          "sandbox.fragments.Dialog",
          this
        );
        this.getView().addDependent(this.oDialog);
      }
      return this.oDialog;
    }
  });
});

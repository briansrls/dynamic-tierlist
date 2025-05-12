/**
 * @name SocialCreditPlugin
 * @author YourName
 * @authorId YourDiscordId
 * @version 1.3.2
 * @description Allows assigning social credit scores via message context menu. Uses BDFDB Library.
 * @source https://github.com/yourusername/SocialCreditPlugin
 * @updateUrl https://raw.githubusercontent.com/yourusername/SocialCreditPlugin/main/SocialCreditPlugin.plugin.js
 */

module.exports = (_ => {
  const changeLog = {
      "1.3.2": "Improved handling of fetch response in submitCreditScore to prevent 'reading ok of undefined' error.",
      "1.3.1": "Corrected UserStore access path from BDFDB.LibraryModules to BDFDB.LibraryStores. Added null check for UserStore.",
      "1.3.0": "Refactored to use BDFDB library for improved stability and compatibility. Changed modal to BDFDB.ModalUtils.",
  };

  return !window.BDFDB_Global || (!window.BDFDB_Global.loaded && !window.BDFDB_Global.started) ? class {
      constructor(meta) { for (let key in meta) this[key] = meta[key]; }
      getName() { return this.name; }
      getAuthor() { return this.author; }
      getVersion() { return this.version; }
      getDescription() { return `The Library Plugin needed for ${this.name} is missing. Open the Plugin Settings to download it. \n\n${this.description}`; }

      downloadLibrary() {
          BdApi.Net.fetch("https://mwittrien.github.io/BetterDiscordAddons/Library/0BDFDB.plugin.js").then(r => {
              if (!r || r.status != 200) throw new Error();
              else return r.text();
          }).then(b => {
              if (!b) throw new Error();
              else return require("fs").writeFile(require("path").join(BdApi.Plugins.folder, "0BDFDB.plugin.js"), b, _ => BdApi.UI.showToast("Finished downloading BDFDB Library", { type: "success" }));
          }).catch(error => {
              BdApi.UI.alert("Error", "Could not download BDFDB Library Plugin. Try again later or download it manually from GitHub: https://mwittrien.github.io/downloader/?library");
          });
      }

      load() {
          if (!window.BDFDB_Global || !Array.isArray(window.BDFDB_Global.pluginQueue)) window.BDFDB_Global = Object.assign({}, window.BDFDB_Global, { pluginQueue: [] });
          if (!window.BDFDB_Global.downloadModal) {
              window.BDFDB_Global.downloadModal = true;
              BdApi.UI.showConfirmationModal("Library Missing", `The Library Plugin needed for ${this.name} is missing. Please click "Download Now" to install it.`, {
                  confirmText: "Download Now",
                  cancelText: "Cancel",
                  onCancel: _ => { delete window.BDFDB_Global.downloadModal; },
                  onConfirm: _ => {
                      delete window.BDFDB_Global.downloadModal;
                      this.downloadLibrary();
                  }
              });
          }
          if (!window.BDFDB_Global.pluginQueue.includes(this.name)) window.BDFDB_Global.pluginQueue.push(this.name);
      }
      start() { this.load(); }
      stop() { }
      getSettingsPanel() {
          let template = document.createElement("template");
          template.innerHTML = `<div style="color: var(--header-primary); font-size: 16px; font-weight: 300; white-space: pre; line-height: 22px;">The Library Plugin needed for ${this.name} is missing.\nPlease click <a style="font-weight: 500;">Download Now</a> to install it.</div>`;
          template.content.firstElementChild.querySelector("a").addEventListener("click", this.downloadLibrary);
          return template.content.firstElementChild;
      }
  } : (([Plugin, BDFDB]) => {
      var _this; // Reference to the plugin instance

      // Component for the score input modal
      const ScoreInputDialogComponent = class ScoreInputDialog extends BdApi.React.Component {
          constructor(props) {
              super(props);
              this.state = { scoreDelta: 0 };
              this.handleChange = this.handleChange.bind(this);
          }

          handleChange(e) {
              const value = parseInt(e.target.value, 10);
              const newScore = isNaN(value) ? 0 : value;
              this.setState({ scoreDelta: newScore });
              if (this.props.onChange) {
                  this.props.onChange(newScore);
              }
          }

          render() {
              return BDFDB.ReactUtils.createElement("div", {
                  className: "socialCreditModalContent",
                  style: { padding: "20px", color: "var(--text-normal)" },
                  children: [
                      BDFDB.ReactUtils.createElement("h3", {
                          style: { marginBottom: "15px", textAlign: "center", fontWeight: "bold", color: "var(--header-primary)" },
                          children: "Adjust Social Credit"
                      }),
                      BDFDB.ReactUtils.createElement("p", {
                           style: { marginBottom: "5px", fontSize: "0.9em" }
                      }, `Target User ID: ${this.props.creditData.target_user_id}`),
                      BDFDB.ReactUtils.createElement("p", {
                           style: { marginBottom: "15px", fontSize: "0.9em" }
                      }, `Message ID: ${this.props.creditData.message_id}`),
                      BDFDB.ReactUtils.createElement("div", {
                          style: { marginBottom: "20px", display: "flex", alignItems: "center", justifyContent: "space-between" },
                          children: [
                              BDFDB.ReactUtils.createElement("label", {
                                  htmlFor: "socialCreditDeltaInputModal",
                                  style: { marginRight: "10px", fontWeight: "bold" }
                              }, "Score Delta:"),
                              BDFDB.ReactUtils.createElement("input", {
                                  type: "number",
                                  id: "socialCreditDeltaInputModal",
                                  value: this.state.scoreDelta,
                                  onChange: this.handleChange,
                                  autoFocus: true,
                                  style: {
                                      width: "100px", padding: "8px", borderRadius: "3px",
                                      border: "1px solid var(--input-background)",
                                      backgroundColor: "var(--input-background)",
                                      color: "var(--text-normal)", textAlign: "center"
                                  }
                              })
                          ]
                      }),
                      BDFDB.ReactUtils.createElement("p", {
                          style: { fontSize: "0.8em", marginTop: "10px", textAlign: "center", opacity: 0.7 }
                      }, "Enter a positive or negative integer.")
                  ]
              });
          }
      };


      return class SocialCreditPlugin extends Plugin {
          onLoad() {
              _this = this;
              this.defaults = {
                  settings: {
                      apiKey: ""
                  }
              };
              this.API_ENDPOINT = "http://localhost:8000/plugin/ratings"; // Ensure this is defined
          }

          onStart() {
              console.log(`[${this.getName()}] Started successfully with BDFDB Library.`);
          }

          onStop() {
              console.log(`[${this.getName()}] Stopped.`);
          }

          getSettingsPanel(collapseStates = {}) {
              let settings = BDFDB.DataUtils.get(this, "settings");

              return BDFDB.PluginUtils.createSettingsPanel(this, {
                  collapseStates: collapseStates,
                  children: _ => [
                      BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsItem, {
                          type: "TextInput",
                          label: "Plugin API Key:",
                          note: "This API key is used to authenticate with your backend server. It's stored locally.",
                          basis: "70%",
                          value: settings.apiKey,
                          placeholder: "Enter your API Key here",
                          inputProps: {
                              type: "password"
                          },
                          onChange: (value) => {
                              BDFDB.DataUtils.set(this, "settings", "apiKey", value);
                          }
                      })
                  ]
              });
          }

          onMessageContextMenu(e) {
              if (e.instance.props.message && e.instance.props.channel) {
                  const message = e.instance.props.message;
                  const channel = e.instance.props.channel;

                  let [children, index] = BDFDB.ContextMenuUtils.findItem(e.returnvalue, { id: ["pin", "unpin", "reply"]});
                  if (index === -1) {
                      index = (e.returnvalue.props.children[0] && e.returnvalue.props.children[0].props && e.returnvalue.props.children[0].props.children) ? e.returnvalue.props.children[0].props.children.length : 0;
                      if (!e.returnvalue.props.children[0] || !e.returnvalue.props.children[0].props || !e.returnvalue.props.children[0].props.children) {
                           e.returnvalue.props.children.unshift(BDFDB.ContextMenuUtils.createItemGroup());
                           children = e.returnvalue.props.children[0].props.children;
                           index = 0;
                      } else {
                           children = e.returnvalue.props.children[0].props.children;
                      }
                  }

                  const menuItem = BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuItem, {
                      label: "Adjust Social Credit",
                      id: BDFDB.ContextMenuUtils.createItemId(this.name, "adjust-credit"),
                      action: _ => {
                          this.handleCreditAdjustAction(message, channel);
                      }
                  });

                  if (children && Array.isArray(children)) {
                       children.splice(index + 1, 0, menuItem);
                  } else if (e.returnvalue && e.returnvalue.props && Array.isArray(e.returnvalue.props.children)) {
                      e.returnvalue.props.children.push(BDFDB.ContextMenuUtils.createItemGroup({children: [menuItem]}));
                  } else {
                      console.warn(`[${this.getName()}] Could not reliably find place to insert context menu item.`);
                  }
              }
          }

          handleCreditAdjustAction(message, channel) {
              let settings = BDFDB.DataUtils.get(this, "settings");
              if (!settings.apiKey) {
                  BDFDB.NotificationUtils.toast("API Key not set. Please configure it in the plugin settings.", { type: "error" });
                  console.error(`[${this.getName()}] API Key is not set.`);
                  return;
              }

              const UserStore = BDFDB.LibraryStores.UserStore;
              if (!UserStore || typeof UserStore.getCurrentUser !== 'function') {
                  BDFDB.NotificationUtils.toast("UserStore is not available. Cannot get current user.", { type: "error" });
                  console.error(`[${this.getName()}] BDFDB.LibraryStores.UserStore or getCurrentUser is not available.`);
                  return;
              }
              const currentUser = UserStore.getCurrentUser();

              if (!currentUser) {
                  BDFDB.NotificationUtils.toast("Could not get current user information.", { type: "error" });
                  console.error(`[${this.getName()}] Failed to get current user (currentUser is null).`);
                  return;
              }

              const creditData = {
                  acting_user_id: currentUser.id,
                  target_user_id: message.author.id,
                  server_id: channel.guild_id || "@me",
                  message_id: message.id
              };

              this.showScoreInputDialog(creditData);
          }

          showScoreInputDialog(creditData) {
              let currentScoreDelta = 0;

              BDFDB.ModalUtils.open(this, {
                  header: "Adjust Social Credit Score",
                  size: "SMALL",
                  children: BDFDB.ReactUtils.createElement(ScoreInputDialogComponent, {
                      creditData: creditData,
                      onChange: (value) => {
                          currentScoreDelta = value;
                      }
                  }),
                  buttons: [{
                      contents: "Submit Score",
                      color: "BRAND",
                      close: true,
                      onClick: () => {
                          const payload = { ...creditData, score_delta: currentScoreDelta };
                          this.submitCreditScore(payload);
                      }
                  }, {
                      contents: "Cancel",
                      color: "TRANSPARENT",
                      look: BDFDB.LibraryComponents.Button.Looks.LINK,
                      close: true
                  }]
              });
          }

          async submitCreditScore(payload) {
              let settings = BDFDB.DataUtils.get(this, "settings");
              if (!settings.apiKey) {
                  BDFDB.NotificationUtils.toast("API Key is missing. Aborting submission.", { type: "error" });
                  return;
              }

              try {
                  const response = await BDFDB.LibraryRequires.fetch(this.API_ENDPOINT, {
                      method: "POST",
                      headers: {
                          "Content-Type": "application/json",
                          "X-Plugin-API-Key": settings.apiKey
                      },
                      body: JSON.stringify(payload)
                  });

                  if (!response) { // Check if response is undefined/null
                      BDFDB.NotificationUtils.toast("Submission failed: No response from server.", { type: "error" });
                      console.error(`[${this.getName()}] Fetch returned undefined. Payload:`, payload);
                      return;
                  }
                  
                  // Assuming 'response' is a Fetch API-like Response object if it's not undefined.
                  // It should have a 'status' property and a 'text()' method.
                  // The 'ok' property is true if status is 200-299.

                  if (response.status === 201) { // Specifically check for 201 Created
                      BDFDB.NotificationUtils.toast("Social credit score submitted successfully!", { type: "success" });
                      console.log(`[${this.getName()}] Social credit score submitted successfully:`, payload);
                  } else if (response.ok) { // Handle other 2xx success statuses (ok is true for 200-299)
                      BDFDB.NotificationUtils.toast(`Score submission acknowledged (Status: ${response.status})!`, { type: "info" });
                      console.log(`[${this.getName()}] Score submission acknowledged with status ${response.status}:`, payload);
                  } else { // Handle non-ok responses (4xx, 5xx)
                      let errorText = "Could not retrieve error details from server.";
                      try {
                          // Ensure response.text() is awaited if it's a promise
                          errorText = await response.text(); 
                      } catch (textError) {
                          console.error(`[${this.getName()}] Failed to get error text from response:`, textError);
                      }
                      BDFDB.NotificationUtils.toast(`API Error: ${response.status} - ${errorText || response.statusText || "Unknown server error"}`, { type: "error", timeout: 7000 });
                      console.error(`[${this.getName()}] API Error: Status: ${response.status}, StatusText: ${response.statusText}, Body: ${errorText}, Payload:`, payload);
                  }
              } catch (error) { // This catches actual promise rejections (network down, DNS issues etc.)
                  BDFDB.NotificationUtils.toast("Failed to send score. Network error or server down. Check console.", { type: "error", timeout: 7000 });
                  console.error(`[${this.getName()}] Network or other error submitting score:`, error, "Payload:", payload);
              }
          }
      };
  })(window.BDFDB_Global.PluginUtils.buildPlugin(changeLog));
})();

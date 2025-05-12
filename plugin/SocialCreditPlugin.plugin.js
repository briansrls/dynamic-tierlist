/**
 * @name SocialCreditPlugin
 * @author YourName
 * @authorId YourDiscordId
 * @version 1.3.6
 * @description Allows assigning social credit scores via message context menu. Uses BDFDB Library.
 * @source https://github.com/yourusername/SocialCreditPlugin
 * @updateUrl https://raw.githubusercontent.com/yourusername/SocialCreditPlugin/main/SocialCreditPlugin.plugin.js
 */

module.exports = (_ => {
  const changeLog = {
      "1.3.6": "Corrected modal closing logic when submitting with Enter key. Removed erroneous BDFDB.ModalUtils.close call.",
      "1.3.5": "Corrected API key saving to BDFDB.DataUtils.save. Enhanced modal: empty default, scroll to change score, Enter to submit, style tweaks. Addressed passive listener warning context.",
      // ... previous changelog entries
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
              this.state = { scoreDelta: null }; 
              this.handleChange = this.handleChange.bind(this);
              this.handleKeyDown = this.handleKeyDown.bind(this);
              this.inputRef = BDFDB.ReactUtils.createRef(); 
          }

          componentDidMount() {
              if (this.inputRef.current) {
                  this.inputRef.current.focus();
              }
          }

          handleChange(eOrValue) {
              let newValue;
              let internalValueToSet; 

              if (typeof eOrValue === 'number') { 
                  newValue = eOrValue;
                  internalValueToSet = newValue;
              } else { 
                  if (eOrValue.target.value === "") { 
                      newValue = null; 
                      internalValueToSet = ""; 
                  } else {
                      const parsedValue = parseInt(eOrValue.target.value, 10);
                      newValue = isNaN(parsedValue) ? null : parsedValue; 
                      internalValueToSet = isNaN(parsedValue) ? "" : parsedValue; 
                  }
              }
              
              this.setState({ scoreDelta: internalValueToSet }); 
              if (this.props.onChange) {
                  this.props.onChange(newValue); 
              }
          }

          handleKeyDown(e) {
              if (e.key === 'Enter') {
                  e.preventDefault();
                  if (this.props.onSubmit) {
                      this.props.onSubmit(); 
                  }
              }
          }

          render() {
              const displayValue = this.state.scoreDelta === null ? "" : this.state.scoreDelta;

              return BDFDB.ReactUtils.createElement("div", {
                  className: "socialCreditModalContent", 
                  style: { padding: "20px", color: "var(--text-normal)", display: "flex", flexDirection: "column", gap: "15px" },
                  children: [
                      BDFDB.ReactUtils.createElement("h3", {
                          style: { textAlign: "center", fontWeight: "bold", color: "var(--header-primary)", margin: "0 0 5px 0" },
                          children: "Adjust Social Credit"
                      }),
                      BDFDB.ReactUtils.createElement("div", { 
                          style: { display: "flex", flexDirection: "column", gap: "3px", fontSize: "0.9em", opacity: "0.8" },
                          children: [
                              BDFDB.ReactUtils.createElement("span", {}, `Target User ID: ${this.props.creditData.target_user_id}`),
                              BDFDB.ReactUtils.createElement("span", {}, `Message ID: ${this.props.creditData.message_id}`)
                          ]
                      }),
                      BDFDB.ReactUtils.createElement("div", {
                          style: { display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginTop: "5px" },
                          children: [
                              BDFDB.ReactUtils.createElement("label", {
                                  htmlFor: "socialCreditDeltaInputModal",
                                  style: { fontWeight: "bold" }
                              }, "Score Delta:"),
                              BDFDB.ReactUtils.createElement("input", {
                                  ref: this.inputRef, 
                                  type: "number",
                                  id: "socialCreditDeltaInputModal",
                                  value: displayValue, 
                                  onChange: this.handleChange,
                                  onKeyDown: this.handleKeyDown, 
                                  style: {
                                      width: "80px", 
                                      padding: "10px", 
                                      borderRadius: "5px", 
                                      border: "1px solid var(--input-background-hover)", 
                                      backgroundColor: "var(--input-background)",
                                      color: "var(--text-normal)",
                                      textAlign: "center",
                                      fontSize: "1.1em" 
                                  }
                              })
                          ]
                      }),
                      BDFDB.ReactUtils.createElement("p", {
                          style: { fontSize: "0.8em", textAlign: "center", opacity: 0.7, marginTop: "5px" }
                      }, "Enter a number or press Enter to submit.")
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
              this.API_ENDPOINT = "http://localhost:8000/plugin/ratings";
              let loadedSettings = BDFDB.DataUtils.load(this, "settings");
              console.log(`[${this.getName()}] Initial settings loaded by BDFDB:`, loadedSettings);
          }

          onStart() {
              console.log(`[${this.getName()}] Started successfully with BDFDB Library.`);
              if (!BdApi.Net || typeof BdApi.Net.fetch !== 'function') {
                  console.error(`[${this.getName()}] CRITICAL: BdApi.Net.fetch is not available! Plugin may not make network requests.`);
                  BDFDB.NotificationUtils.toast("Network request function (BdApi.Net.fetch) is missing. Plugin cannot contact server.", { type: "error" });
              }
              let currentSettings = BDFDB.DataUtils.get(this, "settings");
              console.log(`[${this.getName()}] Settings onStart:`, currentSettings);
          }

          onStop() {
              console.log(`[${this.getName()}] Stopped.`);
          }

          getSettingsPanel(collapseStates = {}) {
              let settings = BDFDB.DataUtils.get(this, "settings");
              // console.log(`[${this.getName()}] Opening settings panel. Current API key: ${settings.apiKey ? settings.apiKey.substring(0,5) + '...' : 'EMPTY'}`);

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
                              // console.log(`[${this.getName()}] API Key input changed to: ${value ? value.substring(0,5) + '...' : 'EMPTY'}`); 
                              BDFDB.DataUtils.save(value, this, "settings", "apiKey"); 
                              BDFDB.NotificationUtils.toast("API Key setting updated.", {type: "info"});
                              
                              // let newSettings = BDFDB.DataUtils.get(this, "settings"); 
                              // console.log(`[${this.getName()}] Settings after attempting to save API Key:`, newSettings);
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
              // console.log(`[${this.getName()}] handleCreditAdjustAction: Retrieved settings:`, settings); 

              if (!settings || !settings.apiKey) {
                  BDFDB.NotificationUtils.toast("API Key not set. Please configure it in the plugin settings.", { type: "error" });
                  console.error(`[${this.getName()}] API Key is not set or settings object is missing. API Key: '${settings ? settings.apiKey : "settings undefined"}'`);
                  return;
              }
              // console.log(`[${this.getName()}] API Key for request (from settings): ${settings.apiKey ? settings.apiKey.substring(0,5) + '...' : 'EMPTY'}`); 

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
              // console.log(`[${this.getName()}] Acting User ID: ${currentUser.id}`); 


              const creditData = {
                  acting_user_id: currentUser.id,
                  target_user_id: message.author.id,
                  server_id: channel.guild_id || "@me",
                  channel_id: channel.id,
                  message_id: message.id,
                  message_content_snippet: message.content ? message.content.substring(0, 100) : ""
              };

              this.showScoreInputDialog(creditData);
          }

          showScoreInputDialog(creditData) {
              let currentScoreDelta = null; 
              
              const performSubmit = () => {
                  const scoreToSend = currentScoreDelta === null ? 0 : currentScoreDelta; 
                  const payload = { ...creditData, score_delta: scoreToSend };
                  this.submitCreditScore(payload);
                  // BDFDB.ModalUtils.close(this); // Removed this incorrect call
                  // The modal should close automatically if the button that performSubmit is tied to
                  // is a primary action button in BDFDB's modal system.
              };

              BDFDB.ModalUtils.open(this, {
                  header: "Adjust Social Credit Score",
                  size: "SMALL", 
                  children: BDFDB.ReactUtils.createElement(ScoreInputDialogComponent, {
                      creditData: creditData,
                      onChange: (value) => { 
                          currentScoreDelta = value;
                      },
                      onSubmit: performSubmit 
                  }),
                  buttons: [{
                      contents: "Submit Score",
                      color: "BRAND", 
                      onClick: performSubmit // BDFDB handles closing after this onClick for BRAND buttons
                  }, {
                      contents: "Cancel",
                      color: "TRANSPARENT", 
                      look: BDFDB.LibraryComponents.Button.Looks.LINK, 
                      close: true // Explicitly tell BDFDB to close on cancel
                  }]
              });
          }

          async submitCreditScore(payload) {
              let settings = BDFDB.DataUtils.get(this, "settings");
              if (!settings || !settings.apiKey) {
                  BDFDB.NotificationUtils.toast("API Key is missing. Aborting submission.", { type: "error" });
                  console.error(`[${this.getName()}] API Key is missing in submitCreditScore. Settings:`, settings);
                  return;
              }
              if (!payload.acting_user_id) {
                   BDFDB.NotificationUtils.toast("Acting User ID is missing. Aborting submission.", { type: "error" });
                  console.error(`[${this.getName()}] acting_user_id is missing in payload for submitCreditScore. Payload:`, payload);
                  return;
              }

              if (!BdApi.Net || typeof BdApi.Net.fetch !== 'function') {
                  console.error(`[${this.getName()}] BdApi.Net.fetch is not available! Cannot make network request.`);
                  BDFDB.NotificationUtils.toast("Network request function is missing. Plugin cannot contact server.", { type: "error" });
                  return;
              }

              const requestOptions = {
                  method: "POST",
                  headers: {
                      "Content-Type": "application/json",
                      "X-Plugin-API-Key": settings.apiKey,
                      "X-Acting-User-ID": payload.acting_user_id
                  },
                  body: JSON.stringify(payload)
              };

              // console.log(`[${this.getName()}] Attempting to submit score with BdApi.Net.fetch. Endpoint: ${this.API_ENDPOINT}, Options:`, requestOptions);

              try {
                  const response = await BdApi.Net.fetch(this.API_ENDPOINT, requestOptions);

                  if (!response) {
                      BDFDB.NotificationUtils.toast("Submission failed: No response from server (BdApi.Net.fetch returned undefined/null).", { type: "error" });
                      console.error(`[${this.getName()}] BdApi.Net.fetch returned undefined/null. Payload:`, payload);
                      return;
                  }
                  
                  const responseBodyText = await response.text(); 

                  if (response.status === 201) {
                      BDFDB.NotificationUtils.toast("Social credit score submitted successfully!", { type: "success" });
                      // console.log(`[${this.getName()}] Social credit score submitted successfully (Status 201). Payload:`, payload, "Response Body:", responseBodyText);
                  } else if (response.ok) { 
                      BDFDB.NotificationUtils.toast(`Score submission acknowledged (Status: ${response.status})!`, { type: "info" });
                      // console.log(`[${this.getName()}] Score submission acknowledged with status ${response.status}. Payload:`, payload, "Response Body:", responseBodyText);
                  } else { 
                      BDFDB.NotificationUtils.toast(`API Error: ${response.status} - ${responseBodyText || response.statusText || "Unknown server error"}`, { type: "error", timeout: 7000 });
                      console.error(`[${this.getName()}] API Error: Status: ${response.status}, StatusText: ${response.statusText}, Body: ${responseBodyText}, Payload:`, payload);
                  }
              } catch (error) { 
                  BDFDB.NotificationUtils.toast("Failed to send score. Network error or server issue. Check console.", { type: "error", timeout: 7000 });
                  console.error(`[${this.getName()}] Network or other error submitting score with BdApi.Net.fetch:`, error, "Payload:", payload);
                  if (error && error.message) console.error(`[${this.getName()}] Error message: ${error.message}`);
                  if (error && error.response) console.error(`[${this.getName()}] Error response object:`, error.response);
              }
          }
      };
  })(window.BDFDB_Global.PluginUtils.buildPlugin(changeLog));
})();

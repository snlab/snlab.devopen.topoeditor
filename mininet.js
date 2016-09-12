define( function (require, exports, module){
  main.consumes = [
      "Editor", "editors", "ui", "save", "vfs", "layout", "watcher",
      "settings", "dialog.error", "c9","ace", "dialog.alert", "dialog.error", "Editor", "editors", "layout",
        "tabManager", "ui", "vfs", "watcher"
  ];
  main.provides = ["mininet"];
  return main;

  function main(options, imports, register){
    var ui = imports.ui;
    var c9 = imports.c9;
    var vfs = imports.vfs;
    var save = imports.save;
    var layout = imports.layout;
    var watcher = imports.watcher;
    var Editor = imports.Editor;
    var editors = imports.editors;
    var settings = imports.settings;
    var ace = imports.ace;
    var showAlert = imports["dialog.alert"].show;
    var showError = imports["dialog.error"].show;
    var tabManager = imports.tabManager;
    var event = require("ace/lib/event");
    var Pixastic = require("./lib_pixastic");

    var loadedFiles = {};
    var basename = require("path").basename;
    var _ = require("lodash");

    // targeted extensions
    var extensions = ["json"];
    // register editor
    var handle = editors.register(
        "minineteditor", "Mininet Editor", MininetEditor, extensions
    );

    var drawn = false;
    var watchedPaths = {};

    function MininetEditor(){
      var plugin = new Editor("Ajax.org", main.consumes, extensions);

      var container;
      var currentSession;

      function setPath(mininetDoc) {
          if (!_.isObject(mininetDoc)|| !_.isObject(mininetDoc.tab)|| !_.isString(mininetDoc.tab.path))
              return;

          var tab = mininetDoc.tab;
          var path = tab.path;
          var session = mininetDoc.getSession();

          // get URL for file at path
          var fullPath = path.match(/^\w+:\/\//) ? path : vfs.url(path);
          if (session.mininet.src === fullPath) {
              return;
          }

          // set/update src URL and load/reload
          session.mininet.src = fullPath;
          session.mininet.load();

          // set/update tab title and tooltip
          mininetDoc.title = basename(path);
          mininetDoc.tooltip = path;

          if (_.isUndefined(watchedPaths[path])) {
              watcher.watch(path);
              watchedPaths[path] = tab;
          }
      }

      function unwatch(path) {
          if (!_.isString(path))
              return;

          if (watchedPaths[path])
          {
              watcher.unwatch(path);
              delete watchedPaths[path];
          }
      }

      // draw mininet (when editor instance first loaded in a pane)
      plugin.on("draw", function(e) {

          container = document.createElement("div");
          // container.classList.add("playerwrapper");
          e.htmlNode.appendChild(container);

          // insert CSS once
          if (drawn)
              return;
          drawn = true;

          var markup = require("text!./index.html");
          ui.insrtHtml(document.body, markup, plugin);

          ui.insertCss(
              require("text!./graph-creator.css"),
              options.staticPrefix,
              handle
          );
      });

      // handle audio file when first opened or moved to different pane
      plugin.on("documentLoad", function(e) {
          var mininetDoc = e.doc;
          var session = mininetDoc.getSession();

          // avoid re-creating audio element and re-adding listeners
          if (session.mininet) {
              return;
          }

          // create audio element
          session.mininet = document.createElement("mininet");
          // session.mininet.setAttribute("controls", "");
          // session.mininet.setAttribute("preload", "");

          // show error message on loading errors
          session.mininet.addEventListener("error", function() {
              showError("Error loading audio file");
          });

          // preserve playing or pausing state
          // session.mininet.addEventListener("playing", function() {
          //     session.paused = false;
          // });
          // session.mininet.addEventListener("pause", function() {
          //     session.paused = true;
          // });

          // handle renaming file from tree while open
          mininetDoc.tab.on("setPath", function(e) {
              setPath(mininetDoc);
          }, session);

          // alert user and close tab if file no longer available
          watcher.on("delete", function(e) {
              var path = e.path;
              var tab = watchedPaths[path];

              // ensure path is being watched
              if (_.isUndefined(tab))
                  return;
              unwatch(path);

              // alert user and close tab
              showAlert(
                  "File is no longer available",
                  path + " is no longer available",
                  null,
                  tab.close
              );
          });

          /**
           * Sets background color of audio player's tab to the same
           * background color of an ace tab
           */
          function updateTabBackground() {
              var tab = mininetDoc.tab;
              var theme = ace.theme;

              if (theme) {
                  if (theme.bg) {
                      // update the background color of the tab's pane
                      tab.pane.aml.$ext.style.backgroundColor = theme.bg;

                      // update tab background color
                      tab.backgroundColor = theme.bg;
                  }

                  // update tab title color
                  if (theme.isDark)
                      tab.classList.add("dark");
                  else
                      tab.classList.remove("dark");
              }
          }

          // update tab background color on theme change
          ace.on("themeChange", updateTabBackground, mininetDoc);

          // update tab background after moving tab to different pane
          tabManager.on("tabAfterReparent", function(e) {
              if (e.tab === mininetDoc.tab)
                  updateTabBackground();
          });

          // set tab background initially
          updateTabBackground();
      });

    }

  }
});

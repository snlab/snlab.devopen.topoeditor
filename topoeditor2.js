define( function (require, exports, module){
  main.consumes = [
    "Editor", "editors", "ui", "save", "vfs", "layout", "watcher",
    "settings", "dialog.error", "c9","ace", "dialog.alert", "dialog.error", "Editor", "editors", "layout",
    "tabManager", "ui", "vfs", "watcher", "fs"
  ];
  main.provides = ["topoeditor2"];
  return main;

  function main(options, imports, register){
    var ui = imports.ui;
    var c9 = imports.c9;
    var vfs = imports.vfs;
    var fs = imports.fs;
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
    // var Pixastic = require("./lib_pixastic");
    var GraphCreator = require("./lib/graph_creator");

    var loadedFiles = {};
    var basename = require("path").basename;
    var _ = require("lodash");

    // targeted extensions
    var extensions = ["topo2"];
    // register editor
    var handle = editors.register(
      "topoeditor2", "Topology Editor", TopoEditor, extensions
    );

    var drawn = false;
    var watchedPaths = {};

    function UndoItem(original, changed, apply) {
      this.getState = function() {};
      this.undo = function() {
        apply(original);
      };
      this.redo = function() {
        apply(changed);
      };
    }

    function TopoEditor(){
      var plugin = new Editor("snlab.org", main.consumes, extensions);

      var container;
      var currentSession;
      var activeDocument;

      /**
       * Sets/updates topology data, tab title to file name, and
       * tooltip to path.
       *
       * @param {object} topoDoc the topology Document to extract data from and act on
       */
      function setPath(topoDoc) {
        if (!_.isObject(topoDoc)|| !_.isObject(topoDoc.tab)|| !_.isString(topoDoc.tab.path))
          return;

        var tab = topoDoc.tab;
        var path = tab.path;
        var session = topoDoc.getSession();

        // load/reload topology data to the editor
        fs.readFile(path, function(err, data) {
          if (err) console.error(err);

          // session.topology.value = data;
          if (data) {
            session.graphCreator.setTopo(data);
          }
          loadedFiles[path] = data;
        });

        // set/update tab title and tooltip
        topoDoc.title = basename(path);
        topoDoc.tooltip = path;

        if (_.isUndefined(watchedPaths[path])) {
          watcher.watch(path);
          watchedPaths[path] = tab;
        }

      }

      /**
       * Unwatched a file, if being watched
       *
       * @param {string} path the path of the file being watched
       */
      function unwatch(path) {
        if (!_.isString(path))
          return;

        if (watchedPaths[path])
        {
          watcher.unwatch(path);
          delete watchedPaths[path];
        }
      }

      // draw topology (when editor instance first loaded in a pane)
      plugin.on("draw", function(e) {

        function saveTopology(path, value, callback) {
          var blob = loadedFiles[path];

          watcher.ignore(path, 60000);

          vfs.rest(path, {
            method: "PUT",
            body: blob
          }, function(err, data, res) {
            callback(err, data);

            watcher.ignore(path);
          });
        }

        container = document.createElement("div");
        // container.style = "position: absolute; left: 0px; right: 0px; top: 7px; bottom: 0px;";
        e.htmlNode.appendChild(container);

        // insert CSS once
        if (drawn)
          return;
        drawn = true;

        // var markup = require("text!./index.html");
        // ui.insrtHtml(container, markup, plugin);

        ui.insertCss(
          require("text!./lib/graph_creator.css"),
          false,
          handle
        );
        save.on("beforeSave", function(e) {
          if (e.document.editor.type == "topoeditor2") {
            var path = e.document.tab.path;

            // Prevent unchanged files from being saved
            // if (!e.document.changed && path == e.path)
            //   return false;

            if (e.document == activeDocument) {
              // loadedFiles[e.path] = e.document.getSession().topology.value;
              loadedFiles[e.path] = e.document.getSession().graphCreator.topoInput();
            }

            return saveTopology;
          }
        });
      });

      // handle topology file when first opened or moved to different pane
      plugin.on("documentLoad", function(e) {
        var topoDoc = e.doc;
        var session = topoDoc.getSession();

        // avoid re-creating topology element and re-adding listeners
        if (session.topology) {
          return;
        }

        // create audio element
        session.topology = document.createElement("div");
        session.topology.className = "topoeditor2";
        session.topology.style = "position: absolute; left: 0px; right: 0px; top: 7px; bottom: 0px;";
        session.graphCreator = new GraphCreator(session.topology);
        session.graphCreator.setIdCt(2);
        session.graphCreator.updateGraph();

        // show error message on loading errors
        // session.topology.addEventListener("error", function() {
        //   showError("Error loading topology file");
        // });

        // session.topology.addEventListener("change", function() {
        //   var lastValue = loadedFiles[topoDoc.tab.path];
          // var currentValue = session.topology.value;
          // topoDoc.undoManager.add(new UndoItem(lastValue, currentValue, function(value) {
          //   loadedFiles[topoDoc.tab.path] = value;
          //   session.topology.value = value;
          // }));
        // });

        // handle renaming file from tree while open
        topoDoc.tab.on("setPath", function(e) {
          setPath(topoDoc);
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
          var tab = topoDoc.tab;
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
        ace.on("themeChange", updateTabBackground, topoDoc);

        // update tab background after moving tab to different pane
        tabManager.on("tabAfterReparent", function(e) {
          if (e.tab === topoDoc.tab)
            updateTabBackground();
        });

        // set tab background initially
        updateTabBackground();

        topoDoc.on("setValue", function set(e) {
          // topoDoc.getSession().topology.value = e.value;
          var path = topoDoc.tab.path;

          if (topoDoc.hasValue()) {
            var lastValue = loadedFiles[path];
            delete loadedFiles[path];

            var currentValue = topoDoc.getSession().graphCreator.topoInput();
            if (typeof lastValue !== 'undefined') {
              topoDoc.undoManager.add(
                new UndoItem(lastValue, currentValue, function(value) {
                  loadedFiles[path] = value;
                  topoDoc.getSession().graphCreator.setTopo(value);
                })
              );
            }
          }
          else {
            setPath(topoDoc);
          }
        });
      });

      // handle when tab for topology file becomes active
      plugin.on("documentActivate", function(e) {
        var topoDoc = e.doc;
        var session = topoDoc.getSession();

        activeDocument = topoDoc;

        // hide current editor from tab (if any)
        if (currentSession && currentSession !== session) {
          currentSession.topology.style.display = "none";
        }

        // update current session
        currentSession = session;

        // ensure new editor is attached to container
        if (!container.contains(currentSession.topology)) {
          container.appendChild(currentSession.topology);
        }

        // ensure new editor is visible
        currentSession.topology.style.display = "initial";
        currentSession.graphCreator.updateWindow();

        // set/update editor src URL
        // setPath(topoDoc);

      });

      // handle document unloading (e.g., when tab is closed or moved to another pane)
      plugin.on("documentUnload", function(e) {
        var topoDoc = e.doc;
        var topology = topoDoc.getSession().topology;

        // remove player from pane
        container.removeChild(topology);
        delete topoDoc.getSession().graphCreator;

        // unwatch path if being watched
        var path = topoDoc.tab.path;
        unwatch(path);
      });

      plugin.freezePublicAPI({
        autoload: false
      });

      plugin.load(null, "topoeditor");

      return plugin;
    }

    // prevent download timeout
    TopoEditor.autoload = false;
    register(null, {
      "topoeditor2": handle
    });
  }
});

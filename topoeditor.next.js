define( function (require, exports, module){
  main.consumes = [
    "Editor", "editors", "ui", "save", "vfs", "layout", "watcher",
    "settings", "dialog.error", "c9","ace", "dialog.alert", "dialog.error", "Editor", "editors", "layout",
    "tabManager", "ui", "vfs", "watcher", "fs"
  ];
  main.provides = ["topoeditor.next"];
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
    var nx = require("./lib/next");

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
          var graph = JSON.parse(data);
          session.topoShell.topologyData(graph);
          loadedFiles[path] = graph;
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

      function topologyModel(document) {
        // Topology Model
        nx.define('snlab.devopen.TopologyModel', nx.data.ObservableObject, {
          properties: {
            nodeId: 1,
            linkId:1,
            newNode: null,
            newLink: null
          },
          methods: {
            createNode: function () {
              var id = this.nodeId();
              var node = {
                name: id,
                iconType: 'switch',
                x: Math.floor(Math.random() * 400),
                y: Math.floor(Math.random() * 400)
              };
              this.newNode(node);
              this.nodeId(++id);
            },
            createLink: function(inLink) {
              var id = this.linkId();
              inLink.id = id;
              this.newLink(inLink);
              this.linkId(++id);
            }
          }
        });

        // Topology View
        nx.define('snlab.devopen.TopologyView', nx.ui.Component, {
          view: {
            content: [
              {
                tag: 'button',
                props: {
                  type: 'button',
                  'class': 'btn-default-css3 btn-green'
                },
                content: 'Add Node',
                events: {
                  click: '{createNode}'
                }
              },
              {
                tag: 'button',
                props: {
                  type: 'button',
                  'class': 'btn-default-css3 btn-green'
                },
                content: 'Delete Node',
                events: {
                  click: '{#_onRemoveNodes}'
                }
              },
              {
                content: [
                  {
                    tag: 'label',
                    content: 'Source ID:'
                  },
                  {
                    name: '_source',
                    tag: 'input'
                  },
                  {
                    tag: 'label',
                    content: 'Target ID:'
                  },
                  {
                    name: '_target',
                    tag: 'input'
                  },
                  {
                    tag: 'button',
                    props: {
                      type: 'button',
                      'class': 'btn-default-css3 btn-green'
                    },
                    content: 'Add Link',
                    events: {
                      click: '{#_onAddLink}'
                    }
                  },
                ]
              },
              {
                name: '_topology',
                type: 'nx.graphic.Topology',
                props: {
                  style: 'border:1px solid #ccc;',
                  width: '{#width}',
                  height: '{#height}',
                  nodeConfig: {
                    label: 'model.name',
                    iconType: 'model.iconType'
                  },
                  linkConfig: {
                    linkType: 'curve'
                  },
                  identityKey: 'name',
                  showIcon: true,
                  adaptive: true,
                  autoLayout: true,
                  dataProcessor: 'force'
                },
                events: {
                  // afterSetData: '{#_onDataChange}',
                  // inserData: '{#_onDataChange}',
                  addNode: '{#_onDataChange}',
                  addLink: '{#_onDataChange}',
                  addNodeSet: '{#_onDataChange}',
                  deleteNode: '{#_onDataChange}',
                  deleteLink: '{#_onDataChange}',
                  deleteNodeSet: '{#_onDataChange}',
                  pressR: '{#_onRemoveNodes}',
                  pressState: '{#_onPressStage}'
                }
              }
            ]
          },
          properties: {
            _sourceId: null,
            _targetId: null,
            width: 800,
            height: 600,
            newNode: {
              set: function (inNode) {
                if (inNode) {
                  var topology = this.view('_topology');
                  topology.addNode(inNode);
                }
              }
            },
            newLink: {
              set: function (inLink) {
                if (inLink) {
                  var topology = this.view('_topology');
                  topology.addLink(inLink);
                }
              }
            },
            data: {
              set: function (data) {
                if (data) {
                  var topology = this.view('_topology');
                  topology.data(data);
                }
              },
              get: function () {
                var topology = this.view('_topology');
                return topology.data();
              }
            },
            document: {
              get: function() {
                return this._document;
              },
              set: function(doc) {
                this._document = doc;
              }
            }
          },
          methods: {
            _onDataChange: function(inSender, inEvent) {
              console.log("Data Change");
              console.log(inSender);
              // inSender.dispatchEvent(nx, inSender, inEvent);
              // console.log(inSender.__listeners__.dragStageEnd[0].handler.toString());
              // dispatchEvent(nx, inSender, inEvent);

              var doc = this.document();
              var lastValue = loadedFiles[doc.tab.path];
              var currentValue = doc.getSession().topoShell.topologyData();
              console.log(currentValue);
              if (typeof lastValue !== 'undefined') {
                doc.undoManager.add(
                  new UndoItem(lastValue, currentValue, function(value) {
                    loadedFiles[doc.tab.path] = value;
                    doc.getSession().topoShell.topologyData(value);
                  })
                );
              }
            },
            _onRemoveNodes: function() {
              console.log("Remove Nodes");
              var topology = this.view('_topology');
              // console.log(topology.selectedNodes().toArray());
              topology.selectedNodes().toArray().forEach(function(node) {
                var nodeId = node.id();
                console.log("Remove", nodeId);
                node.remove();
                topology.eachLink(function(link) {
                  if (link.sourceNodeID() === nodeId ||
                      link.targetNodeID() === nodeId) {
                    console.log("Remove Link", link.sourceNodeID(), link.targetNodeID());
                    link.remove();
                  }
                });
              });
            },
            _onPressStage: function(inSender, inEvent) {
              console.log("Press Stage");
            },
            _onAddLink: function (inSender, inEvent) {
              var source = this.view('_source');
              var target = this.view('_target');
              var sourceId = source.get('value');
              var targetId = target.get('value');
              if (!sourceId) {
                source.dom().focus();
              }
              if (!target) {
                target.dom().focus();
              }
              this.model().createLink({
                source: sourceId,
                target: targetId
              });
            }
          }
        });

        nx.define('snlab.devopen.MainView', nx.ui.Component, {
          properties: {
            topologyData: {
              get: function() {
                var view = this.view('_topology_view');
                return view.data();
              },
              set: function(data) {
                var view = this.view('_topology_view');
                view.data(data);
                return data;
              }
            },
            document: {
              get: function() {
                return this.view('_topology_view').document();
              },
              set: function(doc) {
                this.view('_topology_view').document(doc);
              }
            }
          },
          view: {
            content: [
              // {
              //   type: 'snlab.devopen.ActionPanel'
              // },
              {
                name: '_topology_view',
                type: 'snlab.devopen.TopologyView',
                props: {
                  newNode: '{newNode}',
                  newLink: '{newLink}'
                }
              }
            ]
          }
        });

        var Shell = nx.define(nx.ui.Application, {
          methods: {
            start: function (doc) {
              this.mainView = new snlab.devopen.MainView();
              this.model = new snlab.devopen.TopologyModel();
              this.container(doc.getSession().topology);
              this.mainView.attach(this);
              this.mainView.model(this.model);
              this.mainView.document(doc);
            },
            topologyData: function(data) {
              if (data) {
                this.mainView.topologyData(data);
                return data;
              }
              else {
                return this.mainView.topologyData();
              }
            }
          }
        });

        var shell = new Shell();

        shell.start(document);
        return shell;
      }

      // draw topology (when editor instance first loaded in a pane)
      plugin.on("draw", function(e) {

        function saveTopology(path, value, callback) {
          var topology = loadedFiles[path];
          var blob = JSON.stringify(topology);

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
        e.htmlNode.appendChild(container);

        // insert CSS once
        if (drawn)
          return;
        drawn = true;

        // var markup = require("text!./index.html");
        // ui.insrtHtml(container, markup, plugin);

        ui.insertCss(
          require("text!./lib/next.css"),
          false,
          handle
        );
        save.on("beforeSave", function(e) {
          if (e.document.editor.type == "topoeditor2") {
            var path = e.document.tab.path;

            // Prevent unchanged files from being saved
            if (!e.document.changed && path == e.path)
              return false;

            if (e.document == activeDocument) {
              // loadedFiles[e.path] = e.document.getSession().topology.value;
              loadedFiles[e.path] = e.document.getSession().topoShell.topologyData();
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
        session.topology.style = "width: 100%; height: 100%;";
        session.topoShell = topologyModel(topoDoc);

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

            var currentValue = topoDoc.getSession().topoShell.topologyData();
            if (typeof lastValue !== 'undefined') {
              topoDoc.undoManager.add(
                new UndoItem(lastValue, currentValue, function(value) {
                  loadedFiles[path] = value;
                  topoDoc.getSession().topoShell.topologyData(value);
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

        // set/update editor src URL
        // setPath(topoDoc);

      });

      // handle document unloading (e.g., when tab is closed or moved to another pane)
      plugin.on("documentUnload", function(e) {
        var topoDoc = e.doc;
        var topology = topoDoc.getSession().topology;

        // remove player from pane
        container.removeChild(topology);
        delete topoDoc.getSession().topoShell;

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
      "topoeditor.next": handle
    });
  }
});

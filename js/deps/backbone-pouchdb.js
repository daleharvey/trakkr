/*globals Backbone: false, _: false, Pouch: false */

'use strict';

function noop() {}

// Store models in *PouchDB*.
Backbone.sync = (function() {

  // match read request to get, query or allDocs call
  function read(db, model, options, callback) {

    // get single model
    if (model._id) {
      return db.get(model._id, options, callback);
    }

    // query view
    if (options.view) {
      return db.query(options.view, options, callback);
    }

    // all docs
    db.allDocs(options, callback);
  }

  // the sync adapter function
  var sync = function(method, model, options) {
    
    options = options || {};

    var pouch = model.pouch || (model.collection && model.collection.pouch);
    
    function callback(err, resp) {
      options.wtf(resp);
      // options.success(model, resp, {});
      // complete(err || resp);
      //options.complete(err || resp);
    }

    pouch(function(err, db, defaults) {
      if (err) {
        return options.error(err);
      }
      var opts = _.extend({}, defaults, options);
      switch (method) {
        case "read":   read(db, model, opts, callback);           break;
        case "create": db.post(model.toJSON(), opts, callback);   break;
        case "update": db.put(model.toJSON(), opts, callback);    break;
        case "delete": db.remove(model.toJSON(), opts, callback); break;
      }
    });
  };

  // extend the sync adapter function
  // to init pouch via Backbone.sync.pouch(url, options)
  sync.pouch = function(url, options) {

    var err;
    var db;
    var initialized;
    var waiting = [];

    options = options || {};

    return function open(callback) {
      if (initialized) {
        if (err || db) {
          // we alreay have a pouch adapter available
          callback(err, db, options);
        } else {
          waiting.push(callback);
        }
      } else {
        initialized = true;
        // open pouch
        new Pouch(url, function(e, d) {
          callback(err = e, db = d, options);
          _.each(waiting, open);
          waiting = [];
        });
      }
    };
  };

  return sync;
})();

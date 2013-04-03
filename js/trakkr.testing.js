'use strict';

// Override the LocationProvider so we can send it dummy data

var app = app || {};

app.LocationProvider = Backbone.Model.extend({
  
  timer: null,

  defaults: { 
    lock: false, 
    position: null 
  },

  initialize: function() { 
    app.bind('change:runstarted', this.runStarted.bind(this));
    app.bind('change:runstopped', this.runStopped.bind(this));
  },

  runStarted: function() { 
    this.timer = setInterval(this.updatePosition.bind(this), 1000);
    this.updatePosition();
  },

  runStopped: function() { 
    clearInterval(this.timer);
  },

  updatePosition: function() { 
    var point = testRun.shift();
    this.set({ 
      lock: true,
      position: { 
        timestamp: new Date(point.time).getTime(),
        coords: { 
          latitude: point.lat,
          longitude: point.lon
        }
      }
    });
  }

});

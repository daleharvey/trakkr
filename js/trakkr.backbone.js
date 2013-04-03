var AppView = Backbone.View.extend({
  el: document.body,
  // It's the first function called when this view it's instantiated.
  initialize: function(){
    this.render();
  },
  render: function(){
    this.el.innerText("Hello World");
  }
});

var appView = new AppView();
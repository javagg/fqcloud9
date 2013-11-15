define(function(require, exports, module) {
    var ide = require("core/ide");
    var ext = require("core/ext");
    var util = require("core/util");
    var settings = require("ext/settings/settings");
    var menus = require("ext/menus/menus");
    var dock = require("ext/dockpanel/dockpanel");
    var commands = require("ext/commands/commands");
    var editors = require("ext/editors/editors");
    var css = require("text!ext/highstock/highstock.css");
    var markup = require("text!ext/highstock/highstock.xml");

    var $name = "ext/highstock/highstock"

    module.exports = ext.register($name, {
        name     : "highstock",
        dev      : "Alex Lee",
        alone    : true,
        type     : ext.GENERAL,
        $name    : $name,
        $button  : "pgStockViewer",
        markup   : markup,
        css      : util.replaceStaticPrefix(css),
        deps     : [editors],

        nodes    : [],

        _getDockBar: function() {
            return dock.getBars(this.$name, this.$button)[0];
        },

        _getDockButton: function() {
            return dock.getButtons(this.$name, this.$button)[0];
        },

        getIframe: function() {
            return pgStockViewer.selectSingleNode("iframe");
        },

        onLoad: function() {
            require(["jquery"], function($) {
                require([ "highstock"], function(highstock) {
                    $.getJSON('http://www.highcharts.com/samples/data/jsonp.php?filename=aapl-c.json&callback=?', function(data) {
                        // Create the chart
                        $('#stockchart').highcharts('StockChart', {
                            rangeSelector : {
                                selected : 1
                            },

                            title : {
                                text : 'AAPL Stock Price'
                            },

                            series : [{
                                name : 'AAPL',
                                data : data,
                                tooltip: {
                                    valueDecimals: 2
                                }
                            }]
                        });
                    });
                })
            })
         },

        hook: function() {
            var _self = this

            dock.addDockable({
                expanded : -1,
                width : 400,
                "min-width" : 400,
                barNum: 2,
                headerVisibility: "false",
                sections : [{
                    width : 360,
                    height: 300,
                    buttons : [{
                        caption: "View Stocks",
                        ext : [this.$name, this.$button],
                        hidden : false
                    }]
                }]
            });

            dock.register(this.$name, this.$button, {
                menu : "View Stocks",
                primary : {
                    backgroundImage: ide.staticPrefix + "/ext/main/style/images/sidebar_preview_icon.png",
                    defaultState: { x: -11, y: -10 },
                    activeState: { x: -11, y: -46 }
                }
            }, function() {
                ext.initExtension(_self);
                return pgStockViewer;
            });

            ext.initExtension(this);
        },

        init: function() {
            apf.importCssString(this.css || "");
        },

        stockview: function(url, live) {
            var bar = this._getDockBar();
            dock.showBar(bar);
            dock.expandBar(bar);
            dock.showSection(this.$name, this.$button);
//            this.hidePageHeader();
//            var frmPreview = this.getIframe();
//            if (frmPreview.$ext.src !== url)
//                this.refresh(url);
//            this.live = live;
        },

        enable : function() {
//            var page = ide.getActivePage();
//            var contentType = (page && page.getModel().data.getAttribute("contenttype")) || "";
//            if(this.disableLut[contentType])
//                return this.disable();
            this.$enable();
        },

        disable: function() {
//            this.live = null;
            this.$disable();
        }
    });
});
Ext.define('Rally.technicalservices.HealthSummary',{
    extend: 'Ext.Container',
    alias: 'widget.technicalserviceshealthsummary',
    config: {
        /*
         * @cfg {Boolean}
         * Set to true to show a pie chart representing the story status (default is true)
         * 
         */
        show_story_pie: true,
        /*
         * @cfg {Boolean}
         * Set to true to show a pie chart representing the feature status based on
         * how many features have 100% accepted stories (default is false)
         * 
         */
        show_feature_pie: false,
        /*
         * @cfg {Ext.data.Model}
         * The project for context (required)
         */
        project: null,
        /*
         * @cfg {String}
         * The name of a release to filter on
         */
        release_name: ""
    },
    constructor: function(config) {
        this.mergeConfig(config);
        this.callParent([this.config]);
        this._constructDisplay();
    },
    _constructDisplay: function() {
        var show_story_pie = this.show_story_pie;
        var show_feature_pie = this.show_feature_pie;
        // TODO: change to a real project, not just an object
        var project_name = this.project.Name;
        var release_name = this.release_name;
                
        this.add({
            xtype:'container',
            items:[{
                xtype:'container',
                itemId:'summary_box',
                html: "<b>" + project_name + "</b>",
                padding: 5
            },
            { 
                xtype:'container',
                itemId:'chart_boxes',
                defaults: { padding: 5, margin: 5 },
                layout: { type:'hbox' }
            }]
        });
        if ( show_story_pie ) {
            this._addStoryPieBox(this.down('#chart_boxes'),release_name);
        }
        if ( show_feature_pie ) {
            this._addFeaturePieBox(this.down('#chart_boxes'),release_name);
        }
//        if ( show_story_pie ) {
//            this._addStoryPieBox(this.down('#chart_boxes'),release_name);
//        }
    },
    _addStoryPieBox: function(container,release_name){
        var chart_box = container.add({
            xtype:'container',
            width: 160,
            height: 325
        });
        var measure_field_name = "Count";
        var group_field_name = "ScheduleState";
        
        var filters = [{ property:'Release.Name',value: release_name}];
        var fetch = [group_field_name,measure_field_name];
        var promises = [
            this._getItems("HierarchicalRequirement",fetch,filters),
            this._getItems("Defect",fetch,filters),
            this._getItems("TestSet",fetch,filters)];
        
        Deft.Promise.all(promises).then({
            scope: this,
            success: function(records) {
                var work_items = Ext.Array.flatten(records);
                var pie = this._getPie(work_items,measure_field_name,group_field_name);
                chart_box.add(pie);
                chart_box.add({ xtype:'container',cls:'box_title', html:'Scheduled Work' });
            },
            failure: function(error) {
                alert(error);
            }
        });
    },
    _addFeaturePieBox: function(container,release_name){
        var chart_box = container.add({
            xtype:'container',
            width: 160,
            height: 325
        });
        var measure_field_name = "Count";
        var group_field_name = "PercentDoneByStoryCount";
        
        var filters = [{ property:'Release.Name',value: release_name}];
        var fetch = [group_field_name,measure_field_name];
        var promises = [
            this._getItems("PortfolioItem/Feature",fetch,filters)];
        
        Deft.Promise.all(promises).then({
            scope: this,
            success: function(records) {
                var work_items = Ext.Array.flatten(records);
                if ( group_field_name == "PercentDoneByStoryCount" ) {
                   
                    Ext.Array.each( work_items, function(item) {
                        
                        if ( item.get(group_field_name) < 1 ) {
                            item.set("Status","Complete");
                        } else {
                            item.set("Status","Not Complete");
                        }
                    });
                    group_field_name = "Status";
                }
                var pie = this._getPie(work_items,measure_field_name,group_field_name);
                chart_box.add(pie);
                chart_box.add({ xtype:'container',cls:'box_title', html:'Feature Completion' });
            },
            failure: function(error) {
                alert(error);
            }
        });
    },
    _getItems: function(model_type,fetch,filters) {
        var deferred = Ext.create('Deft.Deferred');
        Ext.create('Rally.data.wsapi.Store',{
            model:model_type,
            filters: filters,
            limit:'Infinity',
            autoLoad: true,
            fetch: fetch,
            listeners: {
                scope: this,
                load: function(store,records,successful,eOpts) {
                    if ( successful ) {
                        deferred.resolve(records);
                    } else {
                        deferred.reject("Problem loading " + model_type);
                    }
                }
            }
        });
        return deferred.promise;
    },
    _getPie: function(records,measure_field_name,group_field_name){
        var totals_by_group = {};
        Ext.Array.each(records,function(record){
            var group=record.get(group_field_name) || "None";
            if ( !totals_by_group[group] ) {
                totals_by_group[group] = 0;
            }
            var add_value = 1;
            if ( measure_field_name !== "Count" ) {
                add_value = record.get(measure_field_name) || 0;
            }
            totals_by_group[group] = totals_by_group[group] + add_value;
        });
        
        var series = [];
        var categories = [];
        Ext.Object.each(totals_by_group,function(field,total){
            series.push([field,total]);
            categories.push(field);
        });
        
        var chart = {
            xtype:'rallychart',
            chartConfig: {
                chart: {
                    type:'pie',
                    width: 150,
                    height: 150
                },
                title: { text:'' },
                plotOptions: {
                    pie: {
                        dataLabels: {
                            enabled: false,
                            connectorWidth: 0
                        },
                        tooltip: {
                            headerFormat: '{point.key} ',
                            pointFormat: '<b>{point.y}</b><br/>'
                        }
                    }
                }
            },
            chartData: {
                series: [{data:series}]
            }            
        };
        return chart;
    }
});
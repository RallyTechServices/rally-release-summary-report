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
         * @cfg {Boolean}
         * Set to true to show a burndown chart that includes Features
         * 
         */
        show_burndown: false,
        /*
         * @cfg {Ext.data.Model}
         * The project for context (required)
         */
        project: null,
        /*
         * @cfg {Ext.data.Model}
         * The release for filtering
         */
        release: null,
        /*
         * @cfg {String}
         * Determine health 
         * from % of stories accepted (Acceptance) 
         * or % of PIs completed (FeatureCompletion)
         */
        health_source: 'Acceptance',
        /*
         * @cfg [{String}]
         * 
         * The schedule states for this workspace. The last TWO of the array
         * are Accepted and beyond Accepted. Use null if Accepted is the final state
         */
        schedule_states: ["Defined","In-Progress","Completed","Accepted",null],
        binary_states: ["Not Complete","Complete"],
        binary_colors: ["#DB4D4D","#339966"],
        pie_height: 160,
        pie_width: 160
    },
    constructor: function(config) {
        this.mergeConfig(config);
        this.callParent([this.config]);
        this._setColors();
        this._constructDisplay();
    },
    _setColors: function() {
        this.schedule_colors = ["#C93","#FF9","#527ACC","#339966"];
        var colors = this.schedule_colors;
        if ( this.schedule_states[0] && this.schedule_states[0] !== "Defined" ) {
            this.schedule_colors.unshift("#D0D0D0");
        }
        if ( this.schedule_states[this.schedule_states.length-1] !== "Accepted" ) {
            this.schedule_colors.push("#A8A8A8");
        }
        
    },
    _constructDisplay: function() {
        
        var health_source = this.health_source || "Acceptance";
        var show_story_pie = this.show_story_pie;
        var show_feature_pie = this.show_feature_pie;
        var show_burndown = this.show_burndown;

        var project_name = this.project.get("Name");
        var release_name = this.release.get("Name");
                
        this.add({
            xtype:'container',
            items:[{
                xtype:'container',
                itemId:'summary_box',
                tpl: "<tpl>{summary_message}</tpl>",
                padding: 5
            },
            { 
                xtype:'container',
                itemId:'chart_boxes',
                layout: { type:'hbox' }
            }]
        });
        this._setSummaryHTML(this.down('#summary_box'));
        
        if ( show_story_pie ) {
            this._addStoryPieBox(this.down('#chart_boxes'),release_name);
        }
        if ( show_feature_pie ) {
            this._addFeaturePieBox(this.down('#chart_boxes'),release_name);
        }
        if ( show_burndown ) {
            this._addBurndownBox(this.down('#chart_boxes'),release_name);
        }
    },
    _setSummaryHTML: function(summary_container) {
        var project_name = this.project.get('Name');
        var release = this.release;
        var done_text = { "Acceptance": " of stories accepted", "FeatureCompletion": "of features completed" };
        var record_names = { "Acceptance": "stories", "FeatureCompletion": "features" };
        
        var release_start = release.get('ReleaseStartDate');
        var release_end = release.get('ReleaseDate');
        
        var summary_message = "<b>" + project_name + "</b>";
        var today = new Date();
        if ( today < release_end && today > release_start ) {
            var total_days = Rally.technicalservices.util.Utilities.daysBetween(release_start,release_end,true);
            var remaining_days = Rally.technicalservices.util.Utilities.daysBetween(today,release_end,true);
            
            var ratio_time_elapsed = 1 - ( remaining_days / total_days );
            this._calculateCompletion(release.get('Name')).then({
                scope: this,
                success: function(results){
                    var ratio_complete = results[0];
                    var percentage_complete = Ext.util.Format.number((100*ratio_complete),"0");
                    if ( percentage_complete == -100 ) {
                        summary_message += "<br/>No " + record_names[this.health_source] + " scheduled.";
                    } else {
                        var targeting_ratio = ratio_complete / ratio_time_elapsed;

                        var status =  "<span class='ts-critical icon-minus'> </span> Critical";
                        if ( targeting_ratio >= 0.9 ) {
                            status = "<span class='icon-ok ts-good'> </span> Good";
                        } else if ( targeting_ratio >= 0.7) {
                            status = "<span class='icon-warning ts-risk'> </span> At Risk";
                        }
                        summary_message += "<b> Release Health is " + status + "</b>";      
                        summary_message += "<br/>With " + remaining_days  + " workdays remaining in a ";
                        summary_message += total_days + "-workday release";
                        
                        summary_message += ", " + percentage_complete + "% " + done_text[this.health_source];
                    }
                    summary_container.update({summary_message:summary_message});
                },
                failure: function(error) {
                    alert(error);
                }
            });            
        } else if ( today > release.get('ReleaseDate') ) {
            summary_message += " <b>- Release Completed</b>";
            summary_container.update({summary_message:summary_message});
        } else {
            summary_message += " <b>- Release Has Not Begun</b>";
            summary_container.update({summary_message:summary_message});
        }
    },
    _calculateCompletion: function(release_name) {
        var deferred = Ext.create('Deft.Deferred');
        var promise = null;
        if ( this.health_source == "Acceptance" ) {
            promise = this._calculateCompletionFromAcceptance(release_name);
        } else if ( this.health_source == "FeatureCompletion" ) {
            promise = this._calculateCompletionFromFeatureCompletion(release_name);
        }
        Deft.Promise.all([promise]).then({
            scope: this,
            success:function(records){deferred.resolve(Ext.Array.flatten(records));},
            failure:function(error){deferred.reject(error);}
        });
        
        return deferred;
    },
    _calculateCompletionFromAcceptance: function(release_name) {
        var deferred = Ext.create('Deft.Deferred');
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
                var number_accepted = 0;
                var total_number_of_items = work_items.length;
                var accepted_states = Ext.Array.slice(this.schedule_states,-2);
                Ext.Array.each(work_items,function(item){
                    if ( Ext.Array.indexOf(accepted_states,item.get(group_field_name)) > -1 ) {
                        number_accepted += 1;
                    }
                });
                var ratio = -1;
                if ( total_number_of_items > 0 ) {
                    ratio = number_accepted/total_number_of_items;
                }
                deferred.resolve([ratio]);
                
            },
            failure: function(error) {
                alert(error);
            }
        });
        return deferred;
    },
    _calculateCompletionFromFeatureCompletion: function(release_name) {
        var deferred = Ext.create('Deft.Deferred');
        var measure_field_name = "Count";
        var group_field_name = "PercentDoneByStoryCount";
        
        var filters = [{ property:'Release.Name',value: release_name}];
        var fetch = [group_field_name,measure_field_name];
        var promises = [this._getItems("PortfolioItem/Feature",fetch,filters)];
        
        Deft.Promise.all(promises).then({
            scope: this,
            success: function(records) {
                var work_items = Ext.Array.flatten(records);
                var number_accepted = 0;
                var total_number_of_items = work_items.length;
                
                if ( group_field_name == "PercentDoneByStoryCount" ) {
                    Ext.Array.each( work_items, function(item) {
                        if ( item.get(group_field_name) == 1 ) {
                            number_accepted += 1;
                        }
                    });
                }
                
                var ratio = -1;
                if ( total_number_of_items > 0 ) {
                    ratio = number_accepted/total_number_of_items;
                }
                deferred.resolve([ratio]);
                
            },
            failure: function(error) {
                alert(error);
            }
        });
        return deferred;
    },
    _addBurndownBox: function(container,release_name){
        var chart_box = container.add({
            xtype:'container'/*,
            height: this.pie_height */
        });
        chart_box.add({
            xtype:'technicalservicessmallerburndown',
            height: this.pie_height,
            project: this.project,
            release: this.release
        });
    },
    _addStoryPieBox: function(container,release_name){
        var chart_box = container.add({
            xtype:'container',
            height: this.pie_height,
            width: this.pie_width
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
            height: this.pie_height,
            width: this.pie_width
        });
        var measure_field_name = "Count";
        var group_field_name = "PercentDoneByStoryCount";
        
        var filters = [{ property:'Release.Name',value: release_name}];
        var fetch = [group_field_name,measure_field_name];
        var promises = [this._getItems("PortfolioItem/Feature",fetch,filters)];
        
        Deft.Promise.all(promises).then({
            scope: this,
            success: function(records) {
                var work_items = Ext.Array.flatten(records);
                if ( group_field_name == "PercentDoneByStoryCount" ) {
                    Ext.Array.each( work_items, function(item) {
                        if ( item.get(group_field_name) < 1 ) {
                            item.set("Status","Not Complete");
                        } else {
                            item.set("Status","Complete");
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
        var project_ref = this.project.get('_ref');
        Ext.create('Rally.data.wsapi.Store',{
            model:model_type,
            filters: filters,
            limit:'Infinity',
            autoLoad: true,
            fetch: fetch,
            context: { project: project_ref },
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
        var colors = this.schedule_colors;
        var valid_group_names = this.schedule_states;
        if ( group_field_name == "Status" ) {
            colors = this.binary_colors;
            valid_group_names = this.binary_states;
        }
        
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
        var show_pie = false;
        Ext.Array.each(valid_group_names,function(group_name){
            var total = totals_by_group[group_name] || 0;
            if ( total > 0 ) { 
                show_pie = true; 
            }
            if ( group_name !== null ) {
                series.push([group_name,total]);
                categories.push(group_name);
            }
        });
        
        var chart = ({xtype:'container',html:'No data'});
        if ( show_pie ) {
            chart = Ext.create('Rally.ui.chart.Chart',{
                chartConfig: {
                    colors: colors,
                    chart: {
                        colors: colors,
                        type:'pie',
                        width: this.pie_width - 10,
                        height: this.pie_height - 10
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
            });
        }
        return chart;
    }
});
Ext.define('Rally.technicalservices.SmallerBurndown',{
    extend: 'Ext.Container',
    alias: 'widget.technicalservicessmallerburndown',
    config: {
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
        height: 160,
        width: 320,
        alternate_pi_size_field: 'c_PIPlanEstimate',
        alternate_wp_size_field: 'PlanEstimate',
        alternate_leaf_size_field: 'LeafStoryPlanEstimateTotal',
        alternate_leaf_accepted_size_field: 'AcceptedLeafStoryPlanEstimateTotal'
    },
    constructor: function(config) {
        this.mergeConfig(config);
        this.callParent([this.config]);
        this._getReleaseOids(this.release.get('Name')).then({
            scope: this,
            success: function(records) {
                var start_date = this.release.get('ReleaseStartDate');
                var end_date =   this.release.get('ReleaseDate');
                this._getData(records,start_date,end_date);
            }
        });
    },
     _getReleaseOids: function(release_name) {
        var deferred = Ext.create('Deft.Deferred');
        Ext.create('Rally.data.wsapi.Store',{
            model:'Release',
            fetch: ['ObjectID'],
            filters: [{property:'Name',value:release_name}],
            autoLoad: true,
            context: { project: this.project.get('_ref') },
            listeners: {
                scope: this,
                load: function(store,releases){
                    var release_oids = [];
                    Ext.Array.each(releases,function(release){
                        release_oids.push(release.get('ObjectID'));
                    });
                    deferred.resolve( release_oids );
                }
            }
        });
        return deferred;
    },
    _getData: function(release_oids,start_date,end_date) {
        this._getFeatureScope(release_oids,start_date,end_date,this.alternate_pi_size_field);
    },
    _getFeatureScope: function(release_oids,start_date,end_date,field_name){
        var me = this;
        this._mask("Loading Historical Data");

        var model_types = ['PortfolioItem'];
        this.config = {
            start_date:start_date,
            end_date:end_date,
            day_to_week_switch_point: 60,
            baseline_field_name: field_name,
            release_oids: release_oids,
            model_types: model_types
        };
        var config = this.config;
        var array_of_days = Rally.technicalservices.util.Utilities.arrayOfDaysBetween(config.start_date,config.end_date,true,config.day_to_week_switch_point);
        var promises = _.map(array_of_days,me._getSnapshots,this);
        
        Deft.Promise.all(promises).then({
            scope: this,
            success: function(days) {
                // got back an array of calculated data for each day (tsday model) (plus the null back from the other call)
                me._unmask();
                me._makeChart(days);
            }, 
            failure: function(records) {
                console.log("oops");
            }
        });
    },
    _getSnapshots:function(day){
        var me = this;
        var config = this.config;
        
        var deferred = Ext.create('Deft.Deferred');
        
        var project = this.project.get('ObjectID');
        var day_calculator = Ext.create('TSDay',{
            piSizeFieldName: me.alternate_pi_size_field,
            wpSizeFieldName: me.alternate_wp_size_field,
            JSDate: day
        });
        
        var fetch = [ me.alternate_pi_size_field,me.alternate_wp_size_field,
            me.alternate_leaf_size_field, me.alternate_leaf_accepted_size_field,
            "_TypeHierarchy","ScheduleState","PercentDoneByStoryPlanEstimate"];

        if ( day < new Date() ) {
            Ext.create('Rally.data.lookback.SnapshotStore',{
                fetch: fetch,
                hydrate: ['_TypeHierarchy','ScheduleState'],
                autoLoad: true,
                filters: [
                    {property:'Release',operator:'in',value:config.release_oids},
                    {property:'_TypeHierarchy',operator:'in',value:config.model_types},
                    {property:'__At',operator:'=',value:Rally.util.DateTime.toIsoString(day)},
                    {property:'_ProjectHierarchy', value:project}
                ],
                listeners: {
                    load: function(store,snaps,success){
                        if (success) {    
                            Ext.Array.each(snaps, function(snap){
                                day_calculator.addSnap(snap);
                            });
                            deferred.resolve(day_calculator);
                        } else {
                            deferred.reject("Error Loading Snapshots for " + day);
                        }
                    },
                    scope: this
                }
            });
            return deferred.promise;
        } else {
            return day_calculator;
        }
    },
    _makeChart: function(days){
        var config = this.config;
        var categories = this._getCategories(days);
        var series = this._getSeries(days);
        var increment = this._getIncrement(days);

        var colors = ['#CC8800','#CC8800','#6699FF','#6699FF'];
        
        if ( categories[0] > new Date() ) {
            this.add({
                xtype:'container',
                html:'Release has not yet started'
            });
            this._unmask();
        } else {
            var chart = Ext.create('Rally.ui.chart.Chart',{
                chartColors: colors,
                chartData: {
                    series: series
                },
                chartConfig: {
                    chart: { 
                        type: 'area',
                        width: this.width - 10,
                        height: this.height - 10
                    },
                    title: { text: '', align: 'center' },
                    tooltip: {
                        formatter: function() {
                            if ( /deal/.test(this.series.name) ) {
                                return false;
                            } else {
                                return this.series.name + ': <b>'+ this.y +'</b>';
                            }
                        }
                    },
                    legend: { enabled: false },
                    xAxis: [{
                        categories: categories,
                        tickLength: 0,
                        labels: {
                            enabled: false,
                            align: 'left',
                            rotation: 70,
                            formatter: function() {
                                if ( increment < 1 ) {
                                    return Ext.Date.format(this.value,'H:i');
                                }
                                return Ext.Date.format(this.value,'d-M');
                            }
                        }
                    }],
                    yAxis: [ { labels: { enabled: false }, title: {text: ''} }],
                    plotOptions: {
                        series: {
                            marker: { enabled: false }
                        }
                    }
                }
            });
            chart.setChartColors(colors);
            this.add(chart);
        }        
    },
    _getCategories: function(days){
        var categories = [];
        Ext.Array.each(days,function(day){
            categories.push(day.get('JSDate'));
        });
        return categories;
    },
    _getSeries: function(days){
        var series = [];
        
        var pi_size_data = [];
        var wp_size_data = [];
        var wp_accepted_data = [];
        var leaf_size_data = [];
        var leaf_accepted_size_data = [];
        var leaf_todo_size_data = [];
        var pi_todo_size_data = [];
        
        Ext.Array.each(days, function(day){
            var pi_size = day.get('piSizeTotal');
            var wp_size = day.get('wpSizeTotal');
            var wp_accepted_size = day.get('wpAcceptedTotal');
            var leaf_size = day.get('leafTotal');
            var leaf_accepted_size = day.get('leafAcceptedTotal');
            //var leaf_todo_size = leaf_size - leaf_accepted_size;
            var pi_todo_size = day.get('piUnacceptedTotal'); 
            var leaf_todo_size = day.get('leafUnacceptedTotal'); 
            
            if ( day.get('JSDate') > new Date() ) {
                pi_size = null;
                wp_size = null;
                wp_accepted_size = null;
                leaf_size = null;
                leaf_accepted_size = null;
                leaf_todo_size = null;
                pi_todo_size = null;
            }
            pi_size_data.push(pi_size);
            wp_size_data.push(wp_size);
            wp_accepted_data.push(wp_accepted_size);
            leaf_size_data.push(leaf_size);
            leaf_accepted_size_data.push(leaf_accepted_size);
            leaf_todo_size_data.push(leaf_todo_size);
            pi_todo_size_data.push(pi_todo_size);
        });
        
//        var pi_extension_data = this._getExtensionArray(pi_size_data);
        var ideal_data_by_pi = this._getIdealLine(pi_size_data);        
//        series.push({type:'line',name:'Feature Scope',data:pi_size_data});
//        series.push({type:'line',name:'Feature Scope (extended)',data:pi_extension_data,dashStyle: 'dash',showInLegend: false});

//        var leaf_extension_data = this._getExtensionArray(leaf_size_data);
        var ideal_data_by_leaf = this._getIdealLine(leaf_size_data);
//        series.push({type:'line',name:'Leaf Story Scope',data:leaf_size_data});
//        series.push({type:'line',name:'Leaf Story Scope (extended)',data:leaf_extension_data,dashStyle: 'dash',showInLegend: false});
        
        series.push({type:'column',name:'Remaining Feature Points',data:pi_todo_size_data});
        series.push({type:'line',name:'Ideal (by Feature Scope)',data:ideal_data_by_pi});
        series.push({type:'column',name:'Remaining Story Points',data:leaf_todo_size_data});
        series.push({type:'line',name:'Ideal (by Story Scope)',data:ideal_data_by_leaf});
        //series.push({type:'column',name:'Accepted',data:leaf_accepted_size_data});

//        var leaf_trend_data = this._getTrendData(leaf_size_data,leaf_accepted_size_data);
//        series.push({type:'line',name:'Trend',data:leaf_trend_data});
        return series;
    },
    _getTrendData: function(scope_data,accepted_data) {
        var trend = [];
        Ext.Array.each(scope_data, function(size){
            trend.push(null);
        });
        var scope = null;
        var accepted = null;
        var accepted_index = null;
        Ext.Array.each(scope_data,function(size){
            if ( size !== null ) {
                scope = size;
            }
        });
        Ext.Array.each(accepted_data,function(size,index){
            if ( size !== null ) {
                accepted = size;
                accepted_index = index;
            }
        });
        
        if ( accepted && accepted > 0 && accepted_index > 0) {
            trend = [];
            var incline = accepted / accepted_index;
            var point = 0 - incline;
            Ext.Array.each(scope_data,function(size){
                if ( point !== null ) {
                    point = point + incline;
                }
                trend.push(point);
                if ( point > scope ) {
                    point = null;
                }
            });
        }
        return trend;
    },
    _getIdealLine: function(size_data){
        var max = Ext.Array.max(size_data);
        var decline =  max/( size_data.length - 1 );
        
        var ideal_line = [];
        var next_point = max;
        Ext.Array.each(size_data,function(size){
            if ( next_point < 0 ) { next_point = 0; }
            ideal_line.push(parseFloat(Ext.util.Format.number(next_point,'0.00'),10));
            next_point = next_point - decline;
        });
        return ideal_line;
    },
    _getExtensionArray: function(size_data) {
        var extension_data = [];
        var length_of_data = size_data.length;
        var index_of_last_valid_value = -1;
        var value_of_last_valid_value = null;
        Ext.Array.each(size_data,function(size,idx){
            if (size) {
                index_of_last_valid_value = idx;
                value_of_last_valid_value = size;
            }
            extension_data.push(null);
        });
        
        Ext.Array.each(extension_data,function(size,idx,original_array){
            if ( idx >= index_of_last_valid_value){
                original_array[idx] = value_of_last_valid_value;
            }
        });
        
        return extension_data;
    },
    /*
     * determine what the distance between two x values is
     */
    _getIncrement: function(days){
        var increment = 0;
        if ( days.length > 1 ) {
            increment = Rally.util.DateTime.getDifference(days[1].get('JSDate'),days[0].get('JSDate'),'day');
        }
        return increment;
    },
    _mask: function(text) {
        var me = this;
        setTimeout(function(){
            me.setLoading(text);
        },10);
    },
    _unmask: function() {
        var me = this;
        setTimeout(function(){
            me.setLoading(false);
        },10);
    }
});
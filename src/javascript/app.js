Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    schedule_states: [],
    items: [
        {xtype:'container',itemId:'message_box',tpl:'Hello, <tpl>{_refObjectName}</tpl>'},
        {xtype:'container',itemId:'release_box', padding: 5},
        {xtype:'container',itemId:'display_box'},
        {xtype:'tsinfolink'}
    ],
    launch: function() {
        this.logger.log("Launched with context ", this.getContext());
        var project_oid = this.getContext().getProject().ObjectID;
        Deft.Promise.all([this._getScheduleStates(),this._getProject(project_oid)]).then({
            scope: this,
            success: function(results) {
                var states = results[0];
                var project = results[1][0];
                this.schedule_states = states;
                this.root_project = project;
                
                this.release_box = this.down('#release_box').add({
                    xtype:'rallyreleasecombobox',
                    fieldLabel: 'Release',
                    labelWidth: 50
                });
                this.release_box.on('change',this._constructDisplay,this);
                
                if (typeof(this.getAppId()) == 'undefined' ) {
                    // not inside Rally
                    this._showExternalSettingsDialog(this.getSettingsFields());
                } else {
                    this._constructDisplay();
                }
            },
            failure: function(error) {
                alert("Could not load Schedule States " + error);
            }
        });
    },
    _constructDisplay: function() {
        this.logger.log("_constructDisplay");
        var me = this;
        
        var health_source = this.getSetting('health_source') || "Acceptance";
        
        this.down('#display_box').removeAll();
        
        this.down('#display_box').add({
            xtype:'technicalserviceshealthsummary',
            show_story_pie: this.getSetting('show_story_states'),
            show_feature_pie: this.getSetting('show_feature_status'),
            project: this.root_project,
            release: this.release_box.getRecord(),
            schedule_states: this.schedule_states,
            health_source: health_source,
            show_burndown: this.getSetting('show_burndown')
        });
        
        if ( this.getContext().get('projectScopeDown') ) {
            this.root_project.getCollection('Children').load({
                callback: function(children, operation, success) {
                    Ext.Array.each(children, function(child) {
                        if ( child.get("State") == "Open" ) {
                            var container = me.down('#display_box').add({
                                xtype:'container',
                                margin: '10 10 10 25'
                            });
                            container.add({
                                xtype:'technicalserviceshealthsummary',
                                show_story_pie: me.getSetting('show_story_states'),
                                show_feature_pie: me.getSetting('show_feature_status'),
                                project: child,
                                release: me.release_box.getRecord(),
                                schedule_states: me.schedule_states,
                                health_source: health_source,
                                show_burndown: me.getSetting('show_burndown')
                            });
                        }
                    });
                }
            });
        }
    },
    getSettingsFields: function() {
        return [
        {
            name: 'show_story_states',
            xtype: 'rallycheckboxfield',
            labelWidth: 150,
            fieldLabel: 'Show Story Status'
        },
        {
            name: 'show_feature_status',
            labelWidth: 150,
            xtype: 'rallycheckboxfield',
            fieldLabel: 'Show Feature Status'
        },
        {
            name: 'show_burndown',
            labelWidth: 150,
            xtype: 'rallycheckboxfield',
            fieldLabel: 'Show Burndown Chart'
        },
        { 
            fieldLabel: 'Determine Health Based On',
            labelWidth: 150,
            name:'health_source',
            xtype: 'rallycombobox',
            displayField: '_display_field',
            valueField: '_value_field',
            storeConfig: {
                model: 'TypeDefinition',
                limit: 2,
                pageSize: 2,
                sorters: [{property:'CreationDate ASC'}],
                autoLoad: false,
                    listeners: {
                    load: function(store,records){
                        if ( records.length == 2 ) {
                            records[0].set('_display_field',"Acceptance");
                            records[0].set('_value_field',"Acceptance");
                            records[1].set('_display_field',"Feature Completion");
                            records[1].set('_value_field',"FeatureCompletion");
                        }
                    }
                }
            },
            readyEvent: 'ready' //event fired to signify readiness
        }];
    },
    _getScheduleStates: function() {
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        var states = [];
        Rally.data.ModelFactory.getModel({
            type: 'Defect',
            success: function(model) {
            model.getField('ScheduleState').getAllowedValueStore().load({
                    callback: function(records, operation, success) {
                        Ext.Array.each(records, function(allowedValue) {
                            states.push(allowedValue.get('StringValue'));
                        });
                        if ( states[states.length-1] == "Accepted" ) {
                            // force the last state to null so we know we stop at accepted
                            states.push(null);
                        }
                        deferred.resolve(states);
                    }
                });
            }
        });
        return deferred;
    },
    _getProject: function(project_oid) {
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        
        Rally.data.ModelFactory.getModel({
            type: 'Project',
            success: function(model) {
                model.load(project_oid,{
                    callback: function(result, operation) {
                        deferred.resolve([result]);
                    }
                });
            }
        });
        return deferred;
    },
    // ONLY FOR RUNNING EXTERNALLY
    _showExternalSettingsDialog: function(fields){
        var me = this;
        if ( this.settings_dialog ) { this.settings_dialog.destroy(); }
        this.settings_dialog = Ext.create('Rally.ui.dialog.Dialog', {
             autoShow: false,
             draggable: true,
             width: 400,
             title: 'Settings',
             buttons: [{ 
                text: 'OK',
                handler: function(cmp){
                    var settings = {};
                    Ext.Array.each(fields,function(field){
                        settings[field.name] = cmp.up('rallydialog').down('[name="' + field.name + '"]').getValue();
                    });
                    me.settings = settings;
                    cmp.up('rallydialog').destroy();
                    me._constructDisplay();
                }
            }],
             items: [
                {xtype:'container',html: "&nbsp;", padding: 5, margin: 5},
                {xtype:'container',itemId:'field_box', padding: 5, margin: 5}]
         });
         Ext.Array.each(fields,function(field){
            if ( field.xtype == "rallycombobox" ) {
                if ( field.storeConfig ) {
                    field.storeConfig.autoLoad = true;
                }
            }
            me.settings_dialog.down('#field_box').add(field);
         });
         this.settings_dialog.show();
    }
});

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
        this._getScheduleStates().then({
            scope: this,
            success: function(states) {
                this.schedule_states = states;
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
        
        this.down('#display_box').removeAll();
        
        this.down('#display_box').add({
            xtype:'technicalserviceshealthsummary',
            show_story_pie: this.getSetting('show_story_states'),
            show_feature_pie: this.getSetting('show_feature_status'),
            project: this.getContext().getProject(),
            release: this.release_box.getRecord(),
            schedule_states: this.schedule_states
        });
    },
    getSettingsFields: function() {
        return [{
            name: 'show_story_states',
            xtype: 'rallycheckboxfield',
            labelWidth: 150,
            fieldLabel: 'Show Story State Distribution'
        },
        {
            name: 'show_feature_status',
            labelWidth: 150,
            xtype: 'rallycheckboxfield',
            fieldLabel: 'Show Feature Status'
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
            me.settings_dialog.down('#field_box').add(field);
         });
         this.settings_dialog.show();
    }
});

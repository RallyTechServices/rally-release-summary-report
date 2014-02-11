Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    items: [
        {xtype:'container',itemId:'message_box',tpl:'Hello, <tpl>{_refObjectName}</tpl>'},
        {xtype:'container',itemId:'release_box', padding: 5},
        {xtype:'container',itemId:'display_box'},
        {xtype:'tsinfolink'}
    ],
    launch: function() {
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
    _constructDisplay: function() {
        this.logger.log("_constructDisplay");
        
        this.down('#display_box').removeAll();
        
        this.down('#display_box').add({
            xtype:'technicalserviceshealthsummary',
            show_story_pie: this.getSetting('show_story_states'),
            show_feature_pie: this.getSetting('show_feature_status'),
            project: this.getContext().getProject(),
            release_name: this.release_box.getRecord().get("Name")
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

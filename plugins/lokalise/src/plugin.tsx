import { Builder } from '@builder.io/sdk';
import { LokaliseConfigurationEditor } from './lokalise-configuration-editor';
import { LokaliseApi } from './lokalise';
import uniq from 'lodash/uniq';
import isEqual from 'lodash/isEqual';
import React from 'react';
const context = require('@builder.io/app-context').default;
const pluginId = 'builder-plugin-lokalise';

// translation status that indicate the content is being queued for translations
const enabledTranslationStatuses = ['pending', 'local'];

// Plugin registration
Builder.register('plugin', {
  id: pluginId,
  name: 'Lokalise',
  type: 'integration',
  icon: 'https://cdn.builder.io/api/v1/image/assets%2F7b1b2b7e7e4e4e4e8e8e8e8e8e8e8e8%2Flokalise-icon.png', // Replace with actual Lokalise icon URL if needed
  description: 'Connect your Lokalise account to sync translations.',
  ctaText: 'Connect your Lokalise account',
  settings: [
    {
      name: 'apiKey',
      type: 'string',
      required: true,
      helperText: 'Your Lokalise API Key',
    },
    {
      name: 'projectId',
      type: 'string',
      required: true,
      helperText: 'Your Lokalise Project ID',
    },
  ],
});

// Register a custom editor tab for Lokalise configuration
Builder.register('editor.mainTab', {
  name: 'Lokalise',
  component: (props: any) => (
    <LokaliseConfigurationEditor
      {...props}
      api={new LokaliseApi(props.settings?.apiKey || '')}
      projectId={props.settings?.projectId || ''}
    />
  ),
});

// Example: Register a toolbar button (customize as needed)
// Builder.register('editor.toolbarButton', {
//   component: () => <button>Lokalise Action</button>,
// });

// Example: Accessing state via context (see Builder docs)
// const editingContentModel = context.designerState.editingContentModel;
// const user = context.user;

// Add more Builder.register calls for other plugin features as needed

// Remove all legacy/Smartling/commerce-plugin-tools code

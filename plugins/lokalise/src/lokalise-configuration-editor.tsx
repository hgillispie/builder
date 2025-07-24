/** @jsx jsx */
import { jsx } from '@emotion/core';
import { CustomReactEditorProps, fastClone } from './plugin-helpers';
import { observable, reaction, IReactionOptions, action } from 'mobx';
import React, { useEffect } from 'react';
import { useObserver, useLocalStore } from 'mobx-react';

interface LokaliseProject {
  project_id: string;
  name: string;
  source_language_iso: string;
  project_languages: Array<{ lang_iso: string; description: string; enabled?: boolean }>;
}

interface LokaliseContributor {
  user_id: number;
  email: string;
  fullname: string;
}
import { LokaliseApi } from './lokalise';
import {
  CircularProgress,
  Select,
  MenuItem,
  ListItemText,
  Checkbox,
  Typography,
} from '@material-ui/core';

function useReaction<T = any>(
  expression: () => T,
  effect: (value: T) => void,
  options: IReactionOptions<any, any> = { fireImmediately: true }
): void {
  useEffect(() => reaction(expression, effect, options), []);
}

interface Props extends CustomReactEditorProps {
  api: LokaliseApi;
}

export const LokaliseConfigurationEditor: React.FC<Props> = props => {
  const store = useLocalStore(() => ({
    loading: false,
    projects: [] as any[],
    project: null as LokaliseProject | null,
    contributors: [] as LokaliseContributor[],
    filters: observable.map(props.value ? fastClone(props.value) : { project: '' }),
    targetLocales: [] as { localeId: string, assignees: number[] }[],
    catchError: (err: any) => {
      console.error('search error:', err);
      props.context.snackBar.show('There was an error searching for projects');
      return null;
    },
    async fetchProject(projectId: string) {
      store.loading = true;
      this.project =
        (await props.api.getProject(projectId).catch(e => this.catchError(e))) || null;
      this.contributors = (await props.api.getContributors(projectId).catch(e => this.catchError(e)))?.contributors || [];
      // remove all target locales that are not in this project
      store.targetLocales = store.targetLocales.filter(t => 
        this.project?.project_languages.some(l => l.lang_iso === t.localeId)
      );
      store.setValue();
      store.loading = false;
    },
    setValue() {
      props.onChange({
        ...fastClone(store.filters),
        targetLocales: store.targetLocales,
      });
    },
  }));

  useEffect(() => {
    store.targetLocales = props.value?.targetLocales || [];
  }, [props.value]);

  useReaction(
    () => store.filters.get('project'),
    projectId => {
      if (projectId) {
        // Await the async function and handle errors
        Promise.resolve(store.fetchProject(projectId)).catch(store.catchError);
      } else {
        store.project = null;
      }
    }
  );

  return useObserver(() => (
    <React.Fragment>
      <div css={{ marginBottom: 25, marginTop: 20 }}>
        <div
          css={{
            paddingLeft: 15,
            marginTop: 10,
            paddingBottom: 10,
            borderLeft: '1px solid #ccc',
          }}
        >
          {props.renderEditor({
            object: store.filters,
            fields: [
              {
                name: 'project',
                type: 'string', // Assuming a custom picker for LokaliseProject
                helperText: 'Project choice determines source locale',
                required: true,
              },
            ],
          })}
        </div>
      </div>
      <div css={{ marginBottom: 25, marginTop: 20 }}>
        <div
          css={{
            paddingLeft: 15,
            marginTop: 10,
            paddingBottom: 10,
            borderLeft: '1px solid #ccc',
          }}
        >
          <Typography>Target Locales*</Typography>
          {store.loading ? (
            <div css={{ textAlign: 'center' }}>
              <CircularProgress disableShrink size={20} />{' '}
            </div>
          ) : (
            <Select
              fullWidth
              value={store.targetLocales.map(t => t.localeId)}
              multiple
              renderValue={selected => Array.isArray(selected) ? (selected as string[]).join(',') : ''}
              onChange={action(e => {
                const newValue = e.target.value as string;
                // Remove or add locale objects by localeId
                if (store.targetLocales.some(t => t.localeId === newValue)) {
                  store.targetLocales = store.targetLocales.filter(t => t.localeId !== newValue);
                } else {
                  store.targetLocales = [...store.targetLocales, { localeId: newValue, assignees: [] }];
                }
                store.setValue();
              })}
            >
              {store.project ? (
                store.project.project_languages.filter((l: { lang_iso: string; description: string; enabled?: boolean }) => l.enabled !== false).map((locale: { lang_iso: string; description: string; enabled?: boolean }) => (
                  <MenuItem key={locale.lang_iso} value={locale.lang_iso}>
                    <Checkbox
                      color="primary"
                      checked={store.targetLocales.some(t => t.localeId === locale.lang_iso)}
                    />

                    <ListItemText primary={locale.description} />
                  </MenuItem>
                ))
              ) : (
                <Typography>Pick a project first</Typography>
              )}
            </Select>
          )}
          <Typography css={{ marginBottom: 15, marginTop: 10 }} variant="caption">
            Pick from the list of available target locales
          </Typography>
          {store.targetLocales.map((t, index) => (
            <div key={index} css={{ marginTop: 10 }}>
              <Typography>{t.localeId} Assignees*</Typography>
              <Select
                multiple
                fullWidth
                value={t.assignees}
                onChange={action(e => {
                  store.targetLocales[index].assignees = Array.isArray(e.target.value) ? e.target.value : [];
                  store.setValue();
                })}
              >
                {store.contributors.map(c => (
                  <MenuItem key={c.user_id} value={c.user_id}>
                    <Checkbox checked={t.assignees.includes(c.user_id)} />
                    <ListItemText primary={`${c.fullname} (${c.email})`} />
                  </MenuItem>
                ))}
              </Select>
            </div>
          ))}
        </div>
      </div>
    </React.Fragment>
  ));
};
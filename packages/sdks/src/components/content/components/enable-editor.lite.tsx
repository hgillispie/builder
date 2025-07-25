import type { Signal } from '@builder.io/mitosis';
import {
  Show,
  onEvent,
  onInit,
  onMount,
  onUnMount,
  onUpdate,
  setContext,
  useMetadata,
  useRef,
  useState,
  useStore,
  useTarget,
} from '@builder.io/mitosis';
import builderContext from '../../../context/builder.context.lite.js';
import type { BuilderContextInterface } from '../../../context/types.js';
import { evaluate } from '../../../functions/evaluate/index.js';
import { fastClone } from '../../../functions/fast-clone.js';
import { fetchOneEntry } from '../../../functions/get-content/index.js';
import { isBrowser } from '../../../functions/is-browser.js';
import { isEditing } from '../../../functions/is-editing.js';
import { isPreviewing } from '../../../functions/is-previewing.js';
import { logFetch } from '../../../functions/log-fetch.js';
import { createRegisterComponentMessage } from '../../../functions/register-component.js';
import { _track } from '../../../functions/track/index.js';
import { getInteractionPropertiesForEvent } from '../../../functions/track/interaction.js';
import { getDefaultCanTrack } from '../../../helpers/canTrack.js';
import { getCookieSync } from '../../../helpers/cookie.js';
import { postPreviewContent } from '../../../helpers/preview-lru-cache/set.js';
import {
  createEditorListener,
  type EditType,
} from '../../../helpers/subscribe-to-editor.js';
import { setupBrowserForEditing } from '../../../scripts/init-editing.js';
import type { BuilderContent } from '../../../types/builder-content.js';
import type { ComponentInfo } from '../../../types/components.js';
import type { Dictionary } from '../../../types/typescript.js';
import { triggerAnimation } from '../../block/animator.js';
import DynamicDiv from '../../dynamic-div.lite.jsx';
import type {
  BuilderComponentStateChange,
  ContentProps,
} from '../content.types.js';
import { needsElementRefDivForEditing } from './enable-editor.helpers.js';
import { getWrapperClassName } from './styles.helpers.js';

useMetadata({
  qwik: {
    hasDeepStore: true,
  },
  elementTag: 'state.ContentWrapper',
});

type BuilderEditorProps = Omit<
  ContentProps,
  | 'customComponents'
  | 'apiVersion'
  | 'isSsrAbTest'
  | 'blocksWrapper'
  | 'blocksWrapperProps'
  | 'linkComponent'
> & {
  builderContextSignal: Signal<BuilderContextInterface>;
  setBuilderContextSignal?: (signal: any) => any;
  children?: any;
};
interface BuilderRequest {
  '@type': '@builder.io/core:Request';
  request: {
    url: string;
    query?: { [key: string]: string };
    headers?: { [key: string]: string };
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: any;
  };
  options?: { [key: string]: any };
  bindings?: { [key: string]: string };
}

export default function EnableEditor(props: BuilderEditorProps) {
  /**
   * This var name is hard-coded in some Mitosis Plugins. Do not change.
   */
  const elementRef = useRef<HTMLDivElement>();
  const [hasExecuted, setHasExecuted] = useState<boolean>(false);
  const [contextValue, setContextValue] = useState<any>(
    props.builderContextSignal.value
  );
  const state = useStore({
    prevData: null as Dictionary<any> | null,
    prevLocale: '',
    mergeNewRootState(newData: Dictionary<any>, editType?: EditType) {
      const combinedState = {
        ...props.builderContextSignal.value.rootState,
        ...newData,
      };

      if (props.builderContextSignal.value.rootSetState) {
        props.builderContextSignal.value.rootSetState?.(combinedState);
      } else {
        props.builderContextSignal.value.rootState = combinedState;
      }
      useTarget({
        rsc: () => {
          if (editType === 'server') {
            if (props.builderContextSignal.value.rootSetState) {
              props.builderContextSignal.value.rootSetState?.(combinedState);
            } else {
              props.builderContextSignal.value.rootState = combinedState;
            }
          } else {
            const updatedContext = {
              ...props.builderContextSignal.value,
              rootState: combinedState,
            };
            setContextValue(updatedContext);
          }
        },
        default: () => {
          if (props.builderContextSignal.value.rootSetState) {
            props.builderContextSignal.value.rootSetState(combinedState);
          } else {
            props.builderContextSignal.value.rootState = combinedState;
          }
        },
      });
    },
    mergeNewContent(newContent: BuilderContent, editType?: EditType) {
      const newContentValue = {
        ...props.builderContextSignal.value.content,
        ...newContent,
        data: {
          ...props.builderContextSignal.value.content?.data,
          ...newContent?.data,
        },
        meta: {
          ...props.builderContextSignal.value.content?.meta,
          ...newContent?.meta,
          breakpoints:
            newContent?.meta?.breakpoints ||
            props.builderContextSignal.value.content?.meta?.breakpoints,
        },
      };

      useTarget({
        rsc: () => {
          if (editType === 'server') {
            postPreviewContent({
              value: newContentValue,
              key: newContentValue.id!,
              url: window.location.pathname,
            });
          } else {
            // setContextValue({...contextValue, content: newContentValue});
            const updatedContent = JSON.parse(JSON.stringify(newContentValue));
            const updatedContextValue = {
              ...contextValue,
              content: updatedContent,
            };
            setContextValue(updatedContextValue);
          }
        },
        default: () => {
          props.builderContextSignal.value.content = newContentValue;
        },
      });
    },
    get showContentProps() {
      return props.showContent ? {} : { hidden: true, 'aria-hidden': true };
    },
    ContentWrapper: useTarget({
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      reactNative: props.contentWrapper || ScrollView,
      angular: props.contentWrapper || DynamicDiv,
      default: props.contentWrapper || 'div',
    }),
    processMessage(event: MessageEvent): void {
      return createEditorListener({
        model: props.model,
        trustedHosts: props.trustedHosts,
        callbacks: {
          configureSdk: (messageContent) => {
            const { breakpoints, contentId } = messageContent;
            if (
              !contentId ||
              contentId !== props.builderContextSignal.value.content?.id
            ) {
              return;
            }
            if (breakpoints) {
              state.mergeNewContent({ meta: { breakpoints } });
            }
          },
          animation: (animation) => {
            triggerAnimation(animation);
          },
          contentUpdate: (newContent, editType) => {
            state.mergeNewContent(newContent, editType);
          },
          stateUpdate: (newState, editType) => {
            state.mergeNewRootState(newState, editType);
          },
        },
      })(event);
    },
    httpReqsData: {} as { [key: string]: boolean },
    httpReqsPending: {} as { [key: string]: boolean },

    clicked: false,

    onClick(event: any) {
      if (props.builderContextSignal.value.content) {
        const variationId =
          props.builderContextSignal.value.content?.testVariationId;
        const contentId = props.builderContextSignal.value.content?.id;
        _track({
          apiHost: props.apiHost,
          type: 'click',
          canTrack: getDefaultCanTrack(props.canTrack),
          contentId,
          apiKey: props.apiKey,
          variationId: variationId !== contentId ? variationId : undefined,
          ...getInteractionPropertiesForEvent(event),
          unique: !state.clicked,
        });
      }

      if (!state.clicked) {
        state.clicked = true;
      }
    },

    runHttpRequests() {
      const requests: { [key: string]: string | any } =
        props.builderContextSignal.value.content?.data?.httpRequests ?? {};

      Object.entries(requests).forEach(
        ([key, httpRequest]: [string, BuilderRequest | string]) => {
          if (!httpRequest) return;

          const isCoreRequest =
            typeof httpRequest === 'object' &&
            httpRequest['@type'] === '@builder.io/core:Request';

          // request already in progress
          if (state.httpReqsPending[key]) return;

          // request already completed, and not in edit mode
          if (state.httpReqsData[key] && !isEditing()) return;

          const url = isCoreRequest
            ? httpRequest.request.url
            : (httpRequest as string);

          state.httpReqsPending[key] = true;
          const evaluatedUrl = url.replace(
            /{{([^}]+)}}/g,
            (_match: string, group: string) =>
              String(
                evaluate({
                  code: group,
                  context: props.context || {},
                  localState: undefined,
                  rootState: props.builderContextSignal.value.rootState,
                  rootSetState: props.builderContextSignal.value.rootSetState,
                })
              )
          );

          const fetchRequestObj = isCoreRequest
            ? {
                url: evaluatedUrl,
                method: httpRequest.request.method,
                headers: httpRequest.request.headers,
                body: httpRequest.request.body,
              }
            : {
                url: evaluatedUrl,
                method: 'GET',
              };

          logFetch(JSON.stringify(fetchRequestObj));

          const fetchOptions = {
            method: fetchRequestObj.method,
            headers: fetchRequestObj.headers,
            body: fetchRequestObj.body,
          };
          if (fetchRequestObj.method === 'GET') {
            delete fetchOptions.body;
          }

          fetch(fetchRequestObj.url, fetchOptions)
            .then((response) => response.json())
            .then((json) => {
              state.mergeNewRootState({ [key]: json });
              state.httpReqsData[key] = true;
            })
            .catch((err) => {
              console.error(
                'error fetching dynamic data',
                JSON.stringify(httpRequest),
                err
              );
            })
            .finally(() => {
              state.httpReqsPending[key] = false;
            });
        }
      );
    },
    emitStateUpdate() {
      if (isEditing()) {
        window.dispatchEvent(
          new CustomEvent<BuilderComponentStateChange>(
            'builder:component:stateChange',
            {
              detail: {
                state: fastClone(props.builderContextSignal.value.rootState),
                ref: {
                  name: props.model,
                },
              },
            }
          )
        );
      }
    },
  });

  setContext(builderContext, props.builderContextSignal);

  onUpdate(() => {
    useTarget({
      rsc: () => {},
      default: () => {
        if (props.content) {
          state.mergeNewContent(props.content);
        }
      },
    });
  }, [props.content]);

  onUnMount(() => {
    if (isBrowser()) {
      window.removeEventListener('message', state.processMessage);
      window.removeEventListener(
        'builder:component:stateChangeListenerActivated',
        state.emitStateUpdate
      );
    }
  });

  onEvent(
    'initeditingbldr',
    () => {
      window.addEventListener('message', state.processMessage);

      setupBrowserForEditing({
        ...(props.locale ? { locale: props.locale } : {}),
        ...(props.enrich ? { enrich: props.enrich } : {}),
        ...(props.trustedHosts ? { trustedHosts: props.trustedHosts } : {}),
        modelName: props.model ?? '',
        apiKey: props.apiKey,
      });
      Object.values<ComponentInfo>(
        props.builderContextSignal.value.componentInfos
      ).forEach((registeredComponent) => {
        if (
          !registeredComponent.models?.length ||
          registeredComponent.models.includes(props.model)
        ) {
          const message = createRegisterComponentMessage(registeredComponent);
          window.parent?.postMessage(message, '*');
        }
      });
      window.addEventListener(
        'builder:component:stateChangeListenerActivated',
        state.emitStateUpdate
      );
    },
    elementRef,
    true
  );

  onEvent(
    'initpreviewingbldr',
    () => {
      const searchParams = new URL(location.href).searchParams;
      const searchParamPreviewModel = searchParams.get('builder.preview');
      const searchParamPreviewId = searchParams.get(
        `builder.overrides.${searchParamPreviewModel}`
      );
      const previewApiKey =
        searchParams.get('apiKey') || searchParams.get('builder.space');

      /**
       * Make sure that:
       * - the preview model name is the same as the one we're rendering, since there can be multiple models rendered
       *  at the same time, e.g. header/page/footer.
       * - the API key is the same, since we don't want to preview content from other organizations.
       * - if there is content, that the preview ID is the same as that of the one we receive.
       *
       * TO-DO: should we only update the state when there is a change?
       **/
      if (
        searchParamPreviewModel === 'BUILDER_STUDIO' ||
        (searchParamPreviewModel === props.model &&
          previewApiKey === props.apiKey &&
          (!props.content || searchParamPreviewId === props.content.id))
      ) {
        fetchOneEntry({
          model: props.model,
          apiKey: props.apiKey,
          apiVersion: props.builderContextSignal.value.apiVersion,
          ...(searchParamPreviewModel === 'BUILDER_STUDIO' &&
          props.context?.symbolId
            ? { query: { id: props.context.symbolId } }
            : {}),
        }).then((content) => {
          if (content) {
            state.mergeNewContent(content);
          }
        });
      }
    },
    elementRef,
    true
  );

  /**
   * To initialize previewing and editing, SDKs need to send and receive events
   * to/from visual editor.
   * - in React/hydration frameworks, we just shove all that code into `useEffect(() => {}, [])` (onMount)
   * - in Qwik, we have no hydration step. And we want to avoid eagerly executing code as much as possible
   *
   * Our workaround for Qwik is:
   *
   * - instead of `useVisibleTask$()`, we listen to`useOn('qvisible')` which will have a reference to the root element of the component.
   *   - never use `props.*` or `state.*` inside of the event handler for `'qvisible'`. This guarantees that we are not making the user download a ton of data.
   *   - instead, of you need any data, set it as a data attribute on the root element, and then read those attributes via the element ref (2nd argument of qvisible event handler).
   *   - move heavy editing and previwing logic behind `customEvent` dispatches, guaranteeing that production qwik sdk load time will be perfect (no hydration, no eager code besides tracking impression)
   */
  onMount(() => {
    useTarget({
      qwik: () => {
        if (hasExecuted) return;
      },
    });
    if (isBrowser()) {
      useTarget({
        qwik: () => {
          setHasExecuted(true);
        },
      });
      if (isEditing() && !props.isNestedRender) {
        useTarget({
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          solid: () => INJECT_EDITING_HOOK_HERE,
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          reactNative: () => INJECT_EDITING_HOOK_HERE,
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          react: () => INJECT_EDITING_HOOK_HERE,
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          angular: () => INJECT_EDITING_HOOK_HERE,
          default: () => {
            if (elementRef) {
              elementRef.dispatchEvent(new CustomEvent('initeditingbldr'));
            }
          },
        });
      }

      const shouldTrackImpression = useTarget({
        qwik:
          elementRef.attributes.getNamedItem('shouldTrack')?.value === 'true',
        default:
          props.builderContextSignal.value.content &&
          getDefaultCanTrack(props.canTrack),
      });
      const winningVariantId = getCookieSync({
        name: `builder.tests.${props.builderContextSignal.value.content?.id}`,
        canTrack: true,
      });
      const variationId = useTarget({
        qwik: elementRef.attributes.getNamedItem('variationId')?.value,
        default: props.builderContextSignal.value.content?.testVariationId,
      });

      if (shouldTrackImpression && variationId === winningVariantId) {
        const contentId = useTarget({
          qwik: elementRef.attributes.getNamedItem('contentId')?.value,
          default: props.builderContextSignal.value.content?.id,
        });
        const apiKeyProp = useTarget({
          qwik: elementRef.attributes.getNamedItem('apiKey')?.value,
          default: props.apiKey,
        });

        _track({
          apiHost: props.apiHost,
          type: 'impression',
          canTrack: true,
          contentId,
          apiKey: apiKeyProp!,
          variationId:
            winningVariantId !== contentId ? winningVariantId : undefined,
        });
      }

      /**
       * Override normal content in preview mode.
       * We ignore this when editing, since the edited content is already being sent from the editor via post messages.
       */
      if (isPreviewing() && !isEditing()) {
        useTarget({
          rsc: () => {},
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          solid: () => INJECT_PREVIEWING_HOOK_HERE,
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          reactNative: () => INJECT_PREVIEWING_HOOK_HERE,
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          react: () => INJECT_PREVIEWING_HOOK_HERE,
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore

          angular: () => INJECT_PREVIEWING_HOOK_HERE,
          default: () => {
            if (elementRef) {
              elementRef.dispatchEvent(new CustomEvent('initpreviewingbldr'));
            }
          },
        });
      }
    }
  });

  onInit(() => {
    state.runHttpRequests();
    state.emitStateUpdate();
  });

  onUpdate(() => {
    state.emitStateUpdate();
  }, [props.builderContextSignal.value.rootState]);

  onUpdate(() => {
    if (props.data) {
      if (state.prevData === props.data) {
        return;
      }
      state.mergeNewRootState(props.data);
      state.prevData = props.data;
    }
  }, [props.data]);

  onUpdate(() => {
    if (props.locale) {
      if (state.prevLocale === props.locale) {
        return;
      }
      state.mergeNewRootState({ locale: props.locale });
      state.prevLocale = props.locale;
    }
  }, [props.locale]);

  return (
    <Show
      when={
        props.builderContextSignal.value.content ||
        needsElementRefDivForEditing()
      }
    >
      <state.ContentWrapper
        {...useTarget({
          qwik: {
            apiKey: props.apiKey,
            contentId: props.builderContextSignal.value.content?.id,
            variationId:
              props.builderContextSignal.value.content?.testVariationId,
            shouldTrack: String(
              props.builderContextSignal.value.content &&
                getDefaultCanTrack(props.canTrack)
            ),
          },
          default: {},
        })}
        ref={elementRef}
        onClick={(event: any) => state.onClick(event)}
        builder-content-id={props.builderContextSignal.value.content?.id}
        builder-model={props.model}
        className={getWrapperClassName(
          props.content?.testVariationId || props.content?.id
        )}
        // content exists: render div and display: undefined
        // content does not exist but isEditing/isPreviewing: render div and display: 'none'
        // once inline editing kicks in, it will populate the content and re-render, so display style will be removed
        style={{
          display:
            !props.builderContextSignal.value.content &&
            needsElementRefDivForEditing()
              ? 'none'
              : undefined,
        }}
        {...useTarget({
          reactNative: {
            // currently, we can't set the actual ID here.
            // we don't need it right now, we just need to identify content divs for testing.
            dataSet: { 'builder-content-id': '' },
          },
          default: {},
        })}
        {...state.showContentProps}
        {...props.contentWrapperProps}
      >
        {props.children}
      </state.ContentWrapper>
    </Show>
  );
}

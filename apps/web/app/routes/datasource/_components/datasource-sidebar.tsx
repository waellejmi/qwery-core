import { useParams } from 'react-router';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
} from '@qwery/ui/shadcn-sidebar';
import { SidebarNavigation } from '@qwery/ui/sidebar-navigation';

import { AccountDropdownContainer } from '~/components/account-dropdown-container';
import { createNavigationConfig } from '~/config/datasource.navigation.config';
import { Shortcuts } from 'node_modules/@qwery/ui/src/qwery/shortcuts';

export function DatasourceSidebar() {
  const params = useParams();
  const slug = params.slug as string;

  const navigationConfig = createNavigationConfig(slug);
  return (
    <>
      <Sidebar collapsible="none">
        <SidebarContent>
          <SidebarNavigation config={navigationConfig} />
        </SidebarContent>

        <SidebarFooter>
          <div className="flex flex-col space-y-2 p-4">
            <div
              onClick={() => {
                const isMac =
                  navigator.platform.toUpperCase().indexOf('MAC') >= 0;
                const event = new KeyboardEvent('keydown', {
                  key: 'l',
                  code: 'KeyL',
                  [isMac ? 'metaKey' : 'ctrlKey']: true,
                  bubbles: true,
                  cancelable: true,
                });
                window.dispatchEvent(event);
              }}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  const isMac =
                    navigator.platform.toUpperCase().indexOf('MAC') >= 0;
                  const keyboardEvent = new KeyboardEvent('keydown', {
                    key: 'l',
                    code: 'KeyL',
                    [isMac ? 'metaKey' : 'ctrlKey']: true,
                    bubbles: true,
                    cancelable: true,
                  });
                  window.dispatchEvent(keyboardEvent);
                }
              }}
            >
              <Shortcuts
                items={[
                  {
                    text: 'Agent',
                    keys: ['⌘', 'L'],
                  },
                ]}
              />
            </div>
          </div>
          <AccountDropdownContainer />
        </SidebarFooter>
      </Sidebar>
    </>
  );
}

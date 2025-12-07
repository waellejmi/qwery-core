import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider } from 'next-themes';
import { MemoryRouter } from 'react-router';
import { QweryBreadcrumb } from './qwery-breadcrumb';
import type { BreadcrumbNodeItem } from './qwery-breadcrumb';

const meta: Meta<typeof QweryBreadcrumb> = {
  title: 'Qwery/QweryBreadcrumb',
  component: QweryBreadcrumb,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    (Story) => (
      <ThemeProvider attribute="class" enableSystem defaultTheme="system">
        <MemoryRouter initialEntries={['/prj/main-project']}>
          <div className="p-8">
            <Story />
          </div>
        </MemoryRouter>
      </ThemeProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof QweryBreadcrumb>;

const mockOrganizations: BreadcrumbNodeItem[] = [
  { id: 'org-1', name: 'Acme Corporation', slug: 'acme-corp' },
  { id: 'org-2', name: 'Tech Startup Inc', slug: 'tech-startup' },
  { id: 'org-3', name: 'Global Enterprises', slug: 'global-enterprises' },
  { id: 'org-4', name: 'Small Business Co', slug: 'small-business' },
  { id: 'org-5', name: 'Mega Corp', slug: 'mega-corp' },
  { id: 'org-6', name: 'Another Organization', slug: 'another-org' },
];

const mockProjects: BreadcrumbNodeItem[] = [
  { id: 'project-1', name: 'Main Project', slug: 'main-project' },
  { id: 'project-2', name: 'Side Project', slug: 'side-project' },
  { id: 'project-3', name: 'Test Project', slug: 'test-project' },
  { id: 'project-4', name: 'Demo Project', slug: 'demo-project' },
  { id: 'project-5', name: 'Production Project', slug: 'production-project' },
  { id: 'project-6', name: 'Development Project', slug: 'development-project' },
];

const mockDatasources: BreadcrumbNodeItem[] = [
  { id: 'ds-1', name: 'PostgreSQL Database', slug: 'postgres-db' },
  { id: 'ds-2', name: 'MySQL Database', slug: 'mysql-db' },
  { id: 'ds-3', name: 'SQLite Database', slug: 'sqlite-db' },
  { id: 'ds-4', name: 'MongoDB Database', slug: 'mongodb-db' },
  { id: 'ds-5', name: 'Redis Cache', slug: 'redis-cache' },
  { id: 'ds-6', name: 'Elasticsearch', slug: 'elasticsearch' },
];

const mockNotebooks: BreadcrumbNodeItem[] = [
  { id: 'nb-1', name: 'Analysis Notebook', slug: 'analysis-notebook' },
  { id: 'nb-2', name: 'Exploration Notebook', slug: 'exploration-notebook' },
  { id: 'nb-3', name: 'Reporting Notebook', slug: 'reporting-notebook' },
  { id: 'nb-4', name: 'Testing Notebook', slug: 'testing-notebook' },
  { id: 'nb-5', name: 'Production Notebook', slug: 'production-notebook' },
  { id: 'nb-6', name: 'Development Notebook', slug: 'development-notebook' },
];

const defaultLabels = {
  searchOrgs: 'Search organizations...',
  searchProjects: 'Search projects...',
  searchDatasources: 'Search datasources...',
  searchNotebooks: 'Search notebooks...',
  viewAllOrgs: 'View all organizations',
  viewAllProjects: 'View all projects',
  viewAllDatasources: 'View all datasources',
  viewAllNotebooks: 'View all notebooks',
  newOrg: 'New Organization',
  newProject: 'New Project',
  newDatasource: 'New Datasource',
  newNotebook: 'New Notebook',
  loading: 'Loading...',
};

const defaultPaths = {
  viewAllOrgs: '/organizations',
  viewAllProjects: '/org/acme-corp',
  viewAllDatasources: '/prj/main-project/ds',
  viewAllNotebooks: '/prj/main-project',
};

const defaultHandlers = {
  onOrganizationSelect: (org: BreadcrumbNodeItem) => {
    console.log('Selected organization:', org);
  },
  onProjectSelect: (project: BreadcrumbNodeItem) => {
    console.log('Selected project:', project);
  },
  onDatasourceSelect: (datasource: BreadcrumbNodeItem) => {
    console.log('Selected datasource:', datasource);
  },
  onNotebookSelect: (notebook: BreadcrumbNodeItem) => {
    console.log('Selected notebook:', notebook);
  },
  onViewAllOrgs: () => console.log('View all organizations'),
  onViewAllProjects: () => console.log('View all projects'),
  onViewAllDatasources: () => console.log('View all datasources'),
  onViewAllNotebooks: () => console.log('View all notebooks'),
  onNewOrg: () => console.log('New organization'),
  onNewProject: () => console.log('New project'),
  onNewDatasource: () => console.log('New datasource'),
  onNewNotebook: () => console.log('New notebook'),
};

export const Default: Story = {
  args: {
    organization: {
      items: mockOrganizations,
      isLoading: false,
      current: mockOrganizations[0] ?? null,
    },
    project: {
      items: mockProjects,
      isLoading: false,
      current: mockProjects[0] ?? null,
    },
    labels: defaultLabels,
    paths: defaultPaths,
    ...defaultHandlers,
  },
};

export const WithDatasource: Story = {
  args: {
    organization: {
      items: mockOrganizations,
      isLoading: false,
      current: mockOrganizations[0] ?? null,
    },
    project: {
      items: mockProjects,
      isLoading: false,
      current: mockProjects[0] ?? null,
    },
    object: {
      items: mockDatasources,
      isLoading: false,
      current: mockDatasources[0] ?? null,
      type: 'datasource',
    },
    labels: defaultLabels,
    paths: defaultPaths,
    ...defaultHandlers,
  },
};

export const WithNotebook: Story = {
  args: {
    organization: {
      items: mockOrganizations,
      isLoading: false,
      current: mockOrganizations[0] ?? null,
    },
    project: {
      items: mockProjects,
      isLoading: false,
      current: mockProjects[0] ?? null,
    },
    object: {
      items: mockNotebooks,
      isLoading: false,
      current: mockNotebooks[0] ?? null,
      type: 'notebook',
    },
    labels: defaultLabels,
    paths: defaultPaths,
    ...defaultHandlers,
  },
};

export const Loading: Story = {
  args: {
    organization: {
      items: [],
      isLoading: true,
      current: null,
    },
    project: {
      items: [],
      isLoading: true,
      current: null,
    },
    labels: defaultLabels,
    paths: defaultPaths,
    ...defaultHandlers,
  },
};

export const Empty: Story = {
  args: {
    organization: {
      items: [],
      isLoading: false,
      current: { id: 'org-1', name: 'Acme Corporation', slug: 'acme-corp' },
    },
    project: {
      items: [],
      isLoading: false,
      current: { id: 'project-1', name: 'Main Project', slug: 'main-project' },
    },
    labels: defaultLabels,
    paths: defaultPaths,
    ...defaultHandlers,
  },
};

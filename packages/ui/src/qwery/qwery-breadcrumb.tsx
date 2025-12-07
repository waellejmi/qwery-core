'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, ChevronsUpDown } from 'lucide-react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '../shadcn/command';
import { Popover, PopoverContent, PopoverTrigger } from '../shadcn/popover';
import { Button } from '../shadcn/button';
import { Skeleton } from '../shadcn/skeleton';
import { cn } from '../lib/utils';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '../shadcn/breadcrumb';

const MAX_VISIBLE_ITEMS = 5;

export interface BreadcrumbNodeItem {
  id: string;
  name: string;
  slug: string;
  icon?: string;
}

export interface BreadcrumbNodeProps {
  items: BreadcrumbNodeItem[];
  isLoading: boolean;
  currentLabel: string;
  currentSlug?: string;
  currentIcon?: string;
  searchPlaceholder: string;
  viewAllLabel: string;
  viewAllPath: string;
  newLabel: string;
  onSelect: (item: BreadcrumbNodeItem) => void;
  onViewAll: () => void;
  onNew: () => void;
}

function BreadcrumbNodeDropdown({
  items,
  isLoading,
  currentLabel,
  currentSlug,
  currentIcon,
  searchPlaceholder,
  viewAllLabel,
  viewAllPath: _viewAllPath,
  newLabel,
  onSelect,
  onViewAll,
  onNew,
}: BreadcrumbNodeProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredItems = useMemo(() => {
    if (!search.trim()) {
      return items;
    }
    const query = search.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.slug.toLowerCase().includes(query),
    );
  }, [items, search]);

  const visibleItems = filteredItems.slice(0, MAX_VISIBLE_ITEMS);

  const handleSelect = (item: BreadcrumbNodeItem) => {
    onSelect(item);
    setOpen(false);
    setSearch('');
  };

  const handleViewAll = () => {
    onViewAll();
    setOpen(false);
    setSearch('');
  };

  const handleNew = () => {
    onNew();
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="flex h-auto cursor-pointer items-center gap-1 p-0 font-normal hover:bg-transparent"
        >
          {currentIcon && (
            <img
              src={currentIcon}
              alt={currentLabel}
              className="h-4 w-4 shrink-0 object-contain"
            />
          )}
          <BreadcrumbPage>{currentLabel}</BreadcrumbPage>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="z-[101] w-[300px] p-0" align="start">
        <Command>
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {isLoading ? (
              <div className="p-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="mt-2 h-8 w-full" />
                <Skeleton className="mt-2 h-8 w-full" />
              </div>
            ) : (
              <>
                <CommandEmpty>
                  <span className="text-muted-foreground text-sm">
                    No results found
                  </span>
                </CommandEmpty>
                {visibleItems.length > 0 && (
                  <CommandGroup>
                    {visibleItems.map((item) => {
                      const isCurrent = item.slug === currentSlug;
                      return (
                        <CommandItem
                          key={item.id}
                          onSelect={() => handleSelect(item)}
                          className={cn(
                            'cursor-pointer',
                            isCurrent && 'bg-accent text-accent-foreground',
                          )}
                        >
                          {item.icon && (
                            <img
                              src={item.icon}
                              alt={item.name}
                              className="mr-2 h-4 w-4 shrink-0 object-contain"
                            />
                          )}
                          <span className="truncate">{item.name}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={handleViewAll}
                    className="cursor-pointer"
                  >
                    {viewAllLabel}
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={handleNew} className="cursor-pointer">
                    {newLabel}
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export interface QweryBreadcrumbProps {
  organization?: {
    items: BreadcrumbNodeItem[];
    isLoading: boolean;
    current: BreadcrumbNodeItem | null;
  };
  project?: {
    items: BreadcrumbNodeItem[];
    isLoading: boolean;
    current: BreadcrumbNodeItem | null;
  };
  object?: {
    items: BreadcrumbNodeItem[];
    isLoading: boolean;
    current: BreadcrumbNodeItem | null;
    type: 'datasource' | 'notebook';
  };
  labels: {
    searchOrgs: string;
    searchProjects: string;
    searchDatasources: string;
    searchNotebooks: string;
    viewAllOrgs: string;
    viewAllProjects: string;
    viewAllDatasources: string;
    viewAllNotebooks: string;
    newOrg: string;
    newProject: string;
    newDatasource: string;
    newNotebook: string;
    loading: string;
  };
  paths: {
    viewAllOrgs: string;
    viewAllProjects: string;
    viewAllDatasources: string;
    viewAllNotebooks: string;
  };
  onOrganizationSelect: (org: BreadcrumbNodeItem) => void;
  onProjectSelect: (project: BreadcrumbNodeItem) => void;
  onDatasourceSelect: (datasource: BreadcrumbNodeItem) => void;
  onNotebookSelect: (notebook: BreadcrumbNodeItem) => void;
  onViewAllOrgs: () => void;
  onViewAllProjects: () => void;
  onViewAllDatasources: () => void;
  onViewAllNotebooks: () => void;
  onNewOrg: () => void;
  onNewProject: () => void;
  onNewDatasource: () => void;
  onNewNotebook: () => void;
}

export function QweryBreadcrumb({
  organization,
  project,
  object,
  labels,
  paths,
  onOrganizationSelect,
  onProjectSelect,
  onDatasourceSelect,
  onNotebookSelect,
  onViewAllOrgs,
  onViewAllProjects,
  onViewAllDatasources,
  onViewAllNotebooks,
  onNewOrg,
  onNewProject,
  onNewDatasource,
  onNewNotebook,
}: QweryBreadcrumbProps) {
  if (!organization?.current || !project?.current) {
    return null;
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {/* Organization */}
        <BreadcrumbItem>
          {organization.current ? (
            <BreadcrumbNodeDropdown
              items={organization.items}
              isLoading={organization.isLoading}
              currentLabel={organization.current.name}
              currentSlug={organization.current.slug}
              searchPlaceholder={labels.searchOrgs}
              viewAllLabel={labels.viewAllOrgs}
              viewAllPath={paths.viewAllOrgs}
              newLabel={labels.newOrg}
              onSelect={onOrganizationSelect}
              onViewAll={onViewAllOrgs}
              onNew={onNewOrg}
            />
          ) : (
            <BreadcrumbPage>{labels.loading}</BreadcrumbPage>
          )}
        </BreadcrumbItem>

        <BreadcrumbSeparator>
          <ChevronRight className="h-4 w-4" />
        </BreadcrumbSeparator>

        {/* Project */}
        <BreadcrumbItem>
          {project.current ? (
            <BreadcrumbNodeDropdown
              items={project.items}
              isLoading={project.isLoading}
              currentLabel={project.current.name}
              currentSlug={project.current.slug}
              searchPlaceholder={labels.searchProjects}
              viewAllLabel={labels.viewAllProjects}
              viewAllPath={paths.viewAllProjects}
              newLabel={labels.newProject}
              onSelect={onProjectSelect}
              onViewAll={onViewAllProjects}
              onNew={onNewProject}
            />
          ) : (
            <BreadcrumbPage>{labels.loading}</BreadcrumbPage>
          )}
        </BreadcrumbItem>

        {/* Object (Datasource or Notebook) */}
        {object?.current && (
          <>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              {object.type === 'datasource' ? (
                <BreadcrumbNodeDropdown
                  items={object.items}
                  isLoading={object.isLoading}
                  currentLabel={object.current.name}
                  currentSlug={object.current.slug}
                  currentIcon={object.current.icon}
                  searchPlaceholder={labels.searchDatasources}
                  viewAllLabel={labels.viewAllDatasources}
                  viewAllPath={paths.viewAllDatasources}
                  newLabel={labels.newDatasource}
                  onSelect={onDatasourceSelect}
                  onViewAll={onViewAllDatasources}
                  onNew={onNewDatasource}
                />
              ) : (
                <BreadcrumbNodeDropdown
                  items={object.items}
                  isLoading={object.isLoading}
                  currentLabel={object.current.name}
                  currentSlug={object.current.slug}
                  currentIcon={object.current.icon}
                  searchPlaceholder={labels.searchNotebooks}
                  viewAllLabel={labels.viewAllNotebooks}
                  viewAllPath={paths.viewAllNotebooks}
                  newLabel={labels.newNotebook}
                  onSelect={onNotebookSelect}
                  onViewAll={onViewAllNotebooks}
                  onNew={onNewNotebook}
                />
              )}
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

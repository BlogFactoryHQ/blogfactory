import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Filter, ArrowUpDown, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type SortField = "created_at" | "title";
export type SortDirection = "asc" | "desc";
export type StatusFilter = "all" | "draft" | "published";

interface PostFiltersProps {
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  sourceFilter: string;
  onSourceFilterChange: (value: string) => void;
  modelFilter: string;
  onModelFilterChange: (value: string) => void;
  personaFilter: string;
  onPersonaFilterChange: (value: string) => void;
  campaignFilter: string;
  onCampaignFilterChange: (value: string) => void;
  sortField: SortField;
  sortDirection: SortDirection;
  onSortChange: (field: SortField, direction: SortDirection) => void;
  sourceTypes: string[];
  models: string[];
  personas: { id: string; name: string }[];
  campaigns: { id: string; name: string }[];
  activeFiltersCount: number;
  onClearFilters: () => void;
}

export function PostFilters({
  statusFilter,
  onStatusFilterChange,
  searchQuery,
  onSearchChange,
  sourceFilter,
  onSourceFilterChange,
  modelFilter,
  onModelFilterChange,
  personaFilter,
  onPersonaFilterChange,
  campaignFilter,
  onCampaignFilterChange,
  sortField,
  sortDirection,
  onSortChange,
  sourceTypes,
  models,
  personas,
  campaigns,
  activeFiltersCount,
  onClearFilters,
}: PostFiltersProps) {
  const formatModelName = (modelId: string) => {
    const modelMap: Record<string, string> = {
      "google/gemini-3-flash-preview": "Gemini 3 Flash",
      "google/gemini-2.5-pro": "Gemini 2.5 Pro",
      "google/gemini-2.5-flash": "Gemini 2.5 Flash",
      "openai/gpt-5": "GPT-5",
      "openai/gpt-5-mini": "GPT-5 Mini",
    };
    return modelMap[modelId] || modelId;
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Tabs value={statusFilter} onValueChange={(v) => onStatusFilterChange(v as StatusFilter)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="draft">Drafts</TabsTrigger>
          <TabsTrigger value="published">Published</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="relative min-w-[220px] flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by title..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Filter Dropdown */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="relative">
            <Filter className="h-4 w-4 mr-1.5" />
            Filters
            {activeFiltersCount > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-5 w-5 p-0 flex items-center justify-center text-xs">
                {activeFiltersCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="end">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm">Filters</h4>
              {activeFiltersCount > 0 && (
                <Button variant="ghost" size="sm" onClick={onClearFilters} className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground">
                  Clear all
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Source Type</label>
              <Select value={sourceFilter} onValueChange={onSourceFilterChange}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="All sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  {sourceTypes.map((source) => (
                    <SelectItem key={source} value={source}>
                      {source.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Model</label>
              <Select value={modelFilter} onValueChange={onModelFilterChange}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="All models" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All models</SelectItem>
                  {models.map((model) => (
                    <SelectItem key={model} value={model}>
                      {formatModelName(model)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Persona</label>
              <Select value={personaFilter} onValueChange={onPersonaFilterChange}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="All personas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All personas</SelectItem>
                  <SelectItem value="none">No persona</SelectItem>
                  {personas.map((persona) => (
                    <SelectItem key={persona.id} value={persona.id}>
                      {persona.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Campaign</label>
              <Select value={campaignFilter} onValueChange={onCampaignFilterChange}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="All campaigns" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All campaigns</SelectItem>
                  <SelectItem value="none">No campaign</SelectItem>
                  {campaigns.map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Sort Dropdown */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <ArrowUpDown className="h-4 w-4 mr-1.5" />
            Sort
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56" align="end">
          <div className="space-y-4">
            <h4 className="font-medium text-sm">Sort by</h4>
            <div className="space-y-2">
              <Button
                variant={sortField === "created_at" ? "secondary" : "ghost"}
                size="sm"
                className="w-full justify-start"
                onClick={() => onSortChange("created_at", sortField === "created_at" && sortDirection === "desc" ? "asc" : "desc")}
              >
                Created date
                {sortField === "created_at" && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {sortDirection === "desc" ? "Newest" : "Oldest"}
                  </span>
                )}
              </Button>
              <Button
                variant={sortField === "title" ? "secondary" : "ghost"}
                size="sm"
                className="w-full justify-start"
                onClick={() => onSortChange("title", sortField === "title" && sortDirection === "asc" ? "desc" : "asc")}
              >
                Title
                {sortField === "title" && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {sortDirection === "asc" ? "A-Z" : "Z-A"}
                  </span>
                )}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Active Filter Pills */}
      {activeFiltersCount > 0 && (
        <div className="flex items-center gap-1.5 ml-2">
          {sourceFilter !== "all" && (
            <Badge variant="secondary" className="gap-1">
              {sourceFilter.replace("_", " ")}
              <X className="h-3 w-3 cursor-pointer" onClick={() => onSourceFilterChange("all")} />
            </Badge>
          )}
          {modelFilter !== "all" && (
            <Badge variant="secondary" className="gap-1">
              {formatModelName(modelFilter)}
              <X className="h-3 w-3 cursor-pointer" onClick={() => onModelFilterChange("all")} />
            </Badge>
          )}
          {personaFilter !== "all" && (
            <Badge variant="secondary" className="gap-1">
              {personaFilter === "none" ? "No persona" : personas.find(p => p.id === personaFilter)?.name}
              <X className="h-3 w-3 cursor-pointer" onClick={() => onPersonaFilterChange("all")} />
            </Badge>
          )}
          {campaignFilter !== "all" && (
            <Badge variant="secondary" className="gap-1">
              {campaignFilter === "none" ? "No campaign" : campaigns.find(c => c.id === campaignFilter)?.name}
              <X className="h-3 w-3 cursor-pointer" onClick={() => onCampaignFilterChange("all")} />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

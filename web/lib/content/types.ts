export interface PageMetadata {
  title: string;
  description: string;
  slug: string;
  heroImage?: string;
  order?: number;
  section?: string;
}

export interface Page {
  metadata: PageMetadata;
  content: string;
}

export interface RoadmapItemMetadata {
  title: string;
  status: 'planned' | 'in-progress' | 'completed' | 'on-hold';
  timeframe?: string;
  priority?: 'low' | 'medium' | 'high';
  order?: number;
}

export interface RoadmapItem {
  metadata: RoadmapItemMetadata;
  content: string;
}

export interface NavigationLink {
  label: string;
  href: string;
  external?: boolean;
}

export interface NavigationSection {
  title: string;
  links: NavigationLink[];
}


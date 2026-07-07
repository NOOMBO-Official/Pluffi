export interface WardrobeItem {
  id: string;
  userId: string;
  imageUrl: string;
  category: string; // e.g., "Tops", "Bottoms", "Outerwear", "Shoes", "Accessories"
  description: string;
  color?: string;
  brand?: string;
  size?: string;
  material?: string;
  tags?: string[];
  createdAt: number;
}

export interface Outfit {
  id: string;
  userId: string;
  itemIds: string[];
  prompt: string;
  explanation: string;
  createdAt: number;
}

export interface CalendarEvent {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  title: string;
  outfitId?: string;
  createdAt: number;
}

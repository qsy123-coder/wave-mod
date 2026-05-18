export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      comments: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          mod_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          mod_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          mod_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            columns: ["mod_id"];
            foreignKeyName: "comments_mod_id_fkey";
            isOneToOne: false;
            referencedColumns: ["id"];
            referencedRelation: "mods";
          },
          {
            columns: ["user_id"];
            foreignKeyName: "comments_user_id_fkey";
            isOneToOne: false;
            referencedColumns: ["id"];
            referencedRelation: "profiles";
          },
        ];
      };
      favorites: {
        Row: {
          created_at: string;
          id: string;
          mod_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          mod_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          mod_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            columns: ["mod_id"];
            foreignKeyName: "favorites_mod_id_fkey";
            isOneToOne: false;
            referencedColumns: ["id"];
            referencedRelation: "mods";
          },
          {
            columns: ["user_id"];
            foreignKeyName: "favorites_user_id_fkey";
            isOneToOne: false;
            referencedColumns: ["id"];
            referencedRelation: "profiles";
          },
        ];
      };
      likes: {
        Row: {
          created_at: string;
          id: string;
          mod_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          mod_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          mod_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            columns: ["mod_id"];
            foreignKeyName: "likes_mod_id_fkey";
            isOneToOne: false;
            referencedColumns: ["id"];
            referencedRelation: "mods";
          },
          {
            columns: ["user_id"];
            foreignKeyName: "likes_user_id_fkey";
            isOneToOne: false;
            referencedColumns: ["id"];
            referencedRelation: "profiles";
          },
        ];
      };
      mods: {
        Row: {
          character: string;
          comments_count: number;
          created_at: string;
          created_by: string | null;
          description: string;
          download_url: string;
          downloads_count: number;
          favorites_count: number;
          game_version: string;
          id: string;
          images: string[];
          is_available: boolean;
          is_published: boolean;
          likes_count: number;
          mod_author_url: string | null;
          nsfw: boolean;
          rating_average: number;
          rating_count: number;
          tags: string[];
          title: string;
          updated_at: string;
          version: string;
          video_url: string | null;
          views: number;
          xxmi_install_guide: string;
        };
        Insert: {
          character: string;
          comments_count?: number;
          created_at?: string;
          created_by?: string | null;
          description: string;
          download_url: string;
          downloads_count?: number;
          favorites_count?: number;
          game_version: string;
          id?: string;
          images?: string[];
          is_available?: boolean;
          is_published?: boolean;
          likes_count?: number;
          mod_author_url?: string | null;
          nsfw?: boolean;
          rating_average?: number;
          rating_count?: number;
          tags?: string[];
          title: string;
          updated_at?: string;
          version: string;
          video_url?: string | null;
          views?: number;
          xxmi_install_guide: string;
        };
        Update: {
          character?: string;
          comments_count?: number;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          download_url?: string;
          downloads_count?: number;
          favorites_count?: number;
          game_version?: string;
          id?: string;
          images?: string[];
          is_available?: boolean;
          is_published?: boolean;
          likes_count?: number;
          mod_author_url?: string | null;
          nsfw?: boolean;
          rating_average?: number;
          rating_count?: number;
          tags?: string[];
          title?: string;
          updated_at?: string;
          version?: string;
          video_url?: string | null;
          views?: number;
          xxmi_install_guide?: string;
        };
        Relationships: [
          {
            columns: ["created_by"];
            foreignKeyName: "mods_created_by_fkey";
            isOneToOne: false;
            referencedColumns: ["id"];
            referencedRelation: "profiles";
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          email: string | null;
          id: string;
          role: "admin" | "user" | "vip";
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          id: string;
          role?: "admin" | "user" | "vip";
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          id?: string;
          role?: "admin" | "user" | "vip";
          updated_at?: string;
        };
        Relationships: [];
      };
      ratings: {
        Row: {
          created_at: string;
          id: string;
          mod_id: string;
          score: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          mod_id: string;
          score: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          mod_id?: string;
          score?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            columns: ["mod_id"];
            foreignKeyName: "ratings_mod_id_fkey";
            isOneToOne: false;
            referencedColumns: ["id"];
            referencedRelation: "mods";
          },
          {
            columns: ["user_id"];
            foreignKeyName: "ratings_user_id_fkey";
            isOneToOne: false;
            referencedColumns: ["id"];
            referencedRelation: "profiles";
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      handle_new_user: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      set_updated_at: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<PublicTableName extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][PublicTableName]["Row"];
export type TablesInsert<PublicTableName extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][PublicTableName]["Insert"];
export type TablesUpdate<PublicTableName extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][PublicTableName]["Update"];

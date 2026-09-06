export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      comments: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          is_pinned: boolean;
          mod_id: string;
          parent_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          is_pinned?: boolean;
          mod_id: string;
          parent_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          is_pinned?: boolean;
          mod_id?: string;
          parent_id?: string | null;
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
            columns: ["parent_id"];
            foreignKeyName: "comments_parent_id_fkey";
            isOneToOne: false;
            referencedColumns: ["id"];
            referencedRelation: "comments";
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
      comment_reactions: {
        Row: {
          comment_id: string;
          created_at: string;
          id: string;
          updated_at: string;
          user_id: string;
          value: number;
        };
        Insert: {
          comment_id: string;
          created_at?: string;
          id?: string;
          updated_at?: string;
          user_id: string;
          value: number;
        };
        Update: {
          comment_id?: string;
          created_at?: string;
          id?: string;
          updated_at?: string;
          user_id?: string;
          value?: number;
        };
        Relationships: [
          {
            columns: ["comment_id"];
            foreignKeyName: "comment_reactions_comment_id_fkey";
            isOneToOne: false;
            referencedColumns: ["id"];
            referencedRelation: "comments";
          },
          {
            columns: ["user_id"];
            foreignKeyName: "comment_reactions_user_id_fkey";
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
          download_url: string | null;
          downloads_count: number;
          drive_links: Json;
          favorites_count: number;
          game_key: string;
          game_version: string;
          id: string;
          images: string[];
          is_available: boolean;
          is_featured?: boolean;
          featured_order?: number | null;
          is_published: boolean;
          likes_count: number;
          mod_author_url: string | null;
          nsfw: boolean;
          rating_average: number;
          rating_count: number;
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
          download_url: string | null;
          downloads_count?: number;
          drive_links?: Json;
          favorites_count?: number;
          game_key?: string;
          game_version: string;
          id?: string;
          images?: string[];
          is_available?: boolean;
          is_featured?: boolean;
          featured_order?: number | null;
          is_published?: boolean;
          likes_count?: number;
          mod_author_url?: string | null;
          nsfw?: boolean;
          rating_average?: number;
          rating_count?: number;
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
          download_url?: string | null;
          downloads_count?: number;
          drive_links?: Json;
          favorites_count?: number;
          game_key?: string;
          game_version?: string;
          id?: string;
          images?: string[];
          is_available?: boolean;
          is_featured?: boolean;
          featured_order?: number | null;
          is_published?: boolean;
          likes_count?: number;
          mod_author_url?: string | null;
          nsfw?: boolean;
          rating_average?: number;
          rating_count?: number;
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
          bio: string | null;
          created_at: string;
          display_name: string | null;
          email: string | null;
          id: string;
          layout_style: string | null;
          phone: string | null;
          role: "admin" | "user" | "vip";
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          id: string;
          layout_style?: string | null;
          phone?: string | null;
          role?: "admin" | "user" | "vip";
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          id?: string;
          layout_style?: string | null;
          phone?: string | null;
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
      tutorial_configs: {
        Row: {
          id: string;
          version_id: string;
          status: string;
          title: string;
          subtitle: string;
          image_base_path: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          version_id: string;
          status: string;
          title: string;
          subtitle: string;
          image_base_path: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          version_id?: string;
          status?: string;
          title?: string;
          subtitle?: string;
          image_base_path?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            columns: ["version_id"];
            foreignKeyName: "tutorial_configs_version_id_fkey";
            isOneToOne: false;
            referencedColumns: ["id"];
            referencedRelation: "tutorial_versions";
          },
        ];
      };
      tutorial_versions: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          sort_order: number;
          is_visible: boolean;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          description?: string | null;
          sort_order?: number;
          is_visible?: boolean;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          sort_order?: number;
          is_visible?: boolean;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tutorial_chapters: {
        Row: {
          id: string;
          config_id: string;
          sort_order: number;
          chapter_key: string;
          title: string;
          type: string;
          intro: string | null;
          video_src: string | null;
          video_poster: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          config_id: string;
          sort_order?: number;
          chapter_key: string;
          title: string;
          type: string;
          intro?: string | null;
          video_src?: string | null;
          video_poster?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          config_id?: string;
          sort_order?: number;
          chapter_key?: string;
          title?: string;
          type?: string;
          intro?: string | null;
          video_src?: string | null;
          video_poster?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tutorial_images: {
        Row: {
          id: string;
          chapter_id: string;
          sort_order: number;
          url: string;
          filename: string;
          alt: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          chapter_id: string;
          sort_order?: number;
          url: string;
          filename: string;
          alt?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          chapter_id?: string;
          sort_order?: number;
          url?: string;
          filename?: string;
          alt?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      tutorial_tools: {
        Row: {
          id: string;
          chapter_id: string;
          sort_order: number;
          name: string;
          url: string;
          description: string | null;
          required: boolean;
          cloud_baidu: string | null;
          cloud_quark: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          chapter_id: string;
          sort_order?: number;
          name: string;
          url: string;
          description?: string | null;
          required?: boolean;
          cloud_baidu?: string | null;
          cloud_quark?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          chapter_id?: string;
          sort_order?: number;
          name?: string;
          url?: string;
          description?: string | null;
          required?: boolean;
          cloud_baidu?: string | null;
          cloud_quark?: string | null;
          created_at?: string;
        };
        Relationships: [];
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

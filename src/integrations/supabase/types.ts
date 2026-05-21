export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      app_users: {
        Row: {
          auth_user_id: string | null
          created_at: string
          email: string
          id: string
          name: string | null
          phone: string | null
          workspace_id: string | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          email: string
          id?: string
          name?: string | null
          phone?: string | null
          workspace_id?: string | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          phone?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          actor_email: string | null
          actor_user_id: string | null
          changed_fields: string[] | null
          created_at: string
          id: string
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          operation: string
          origin: string
          reason: string | null
          row_id: string | null
          session_id: string | null
          table_name: string
          user_agent: string | null
          workspace_id: string | null
        }
        Insert: {
          actor_email?: string | null
          actor_user_id?: string | null
          changed_fields?: string[] | null
          created_at?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          operation: string
          origin?: string
          reason?: string | null
          row_id?: string | null
          session_id?: string | null
          table_name: string
          user_agent?: string | null
          workspace_id?: string | null
        }
        Update: {
          actor_email?: string | null
          actor_user_id?: string | null
          changed_fields?: string[] | null
          created_at?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          operation?: string
          origin?: string
          reason?: string | null
          row_id?: string | null
          session_id?: string | null
          table_name?: string
          user_agent?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      backend_event_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          payload: Json | null
          row_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          payload?: Json | null
          row_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          payload?: Json | null
          row_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      billing_attachments: {
        Row: {
          billing_client_id: string | null
          created_at: string
          file_name: string
          id: string
          invoice_id: string | null
          mime_type: string | null
          payment_id: string | null
          size_bytes: number | null
          storage_path: string
          supplier_id: string | null
          uploaded_by: string | null
          workspace_id: string | null
        }
        Insert: {
          billing_client_id?: string | null
          created_at?: string
          file_name: string
          id?: string
          invoice_id?: string | null
          mime_type?: string | null
          payment_id?: string | null
          size_bytes?: number | null
          storage_path: string
          supplier_id?: string | null
          uploaded_by?: string | null
          workspace_id?: string | null
        }
        Update: {
          billing_client_id?: string | null
          created_at?: string
          file_name?: string
          id?: string
          invoice_id?: string | null
          mime_type?: string | null
          payment_id?: string | null
          size_bytes?: number | null
          storage_path?: string
          supplier_id?: string | null
          uploaded_by?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_attachments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "billing_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_attachments_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "billing_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_attachments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "billing_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          category: string
          created_at: string
          id: string
          ip_address: string | null
          message: string | null
          payload: Json
          severity: string
          subscription_id: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          category: string
          created_at?: string
          id?: string
          ip_address?: string | null
          message?: string | null
          payload?: Json
          severity?: string
          subscription_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          category?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          message?: string | null
          payload?: Json
          severity?: string
          subscription_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_audit_logs_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "workspace_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_audit_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_clients: {
        Row: {
          address: string | null
          address_complement: string | null
          bic: string | null
          city: string | null
          contacts: Json
          country: string | null
          created_at: string
          created_by: string | null
          email: string | null
          iban: string | null
          id: string
          is_active: boolean
          kind: string
          name: string
          notes: string | null
          phone: string | null
          postal_code: string | null
          siren: string | null
          siret: string | null
          tax_id: string | null
          tva_intracom: string | null
          updated_at: string
          visibility_scope: string
          workspace_id: string | null
        }
        Insert: {
          address?: string | null
          address_complement?: string | null
          bic?: string | null
          city?: string | null
          contacts?: Json
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          iban?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          siren?: string | null
          siret?: string | null
          tax_id?: string | null
          tva_intracom?: string | null
          updated_at?: string
          visibility_scope?: string
          workspace_id?: string | null
        }
        Update: {
          address?: string | null
          address_complement?: string | null
          bic?: string | null
          city?: string | null
          contacts?: Json
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          iban?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          siren?: string | null
          siret?: string | null
          tax_id?: string | null
          tva_intracom?: string | null
          updated_at?: string
          visibility_scope?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      billing_invoice_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          position: number
          quantity: number
          total: number
          unit_price: number
          vat_rate: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          position?: number
          quantity?: number
          total?: number
          unit_price?: number
          vat_rate?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          position?: number
          quantity?: number
          total?: number
          unit_price?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "billing_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "billing_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_invoices: {
        Row: {
          billing_client_id: string | null
          created_at: string
          created_by: string | null
          customer_name: string | null
          customer_snapshot: Json | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_reason: string | null
          due_date: string | null
          financial_sync_lock: boolean
          fleet_id: string | null
          id: string
          invoice_number: string
          issue_date: string
          last_financial_event_hash: string | null
          last_financial_sync_at: string | null
          metadata: Json
          notes: string | null
          paid_amount: number
          remaining_amount: number | null
          service_order_id: string | null
          source: string
          status: Database["public"]["Enums"]["billing_invoice_status"]
          supplier_id: string | null
          sync_revision: number
          total_amount: number
          type: Database["public"]["Enums"]["billing_invoice_type"]
          updated_at: string
          vehicle_id: string | null
          visibility_scope: string
          workspace_id: string | null
          year_reference: number | null
        }
        Insert: {
          billing_client_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          customer_snapshot?: Json | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          due_date?: string | null
          financial_sync_lock?: boolean
          fleet_id?: string | null
          id?: string
          invoice_number: string
          issue_date?: string
          last_financial_event_hash?: string | null
          last_financial_sync_at?: string | null
          metadata?: Json
          notes?: string | null
          paid_amount?: number
          remaining_amount?: number | null
          service_order_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["billing_invoice_status"]
          supplier_id?: string | null
          sync_revision?: number
          total_amount?: number
          type?: Database["public"]["Enums"]["billing_invoice_type"]
          updated_at?: string
          vehicle_id?: string | null
          visibility_scope?: string
          workspace_id?: string | null
          year_reference?: number | null
        }
        Update: {
          billing_client_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          customer_snapshot?: Json | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          due_date?: string | null
          financial_sync_lock?: boolean
          fleet_id?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          last_financial_event_hash?: string | null
          last_financial_sync_at?: string | null
          metadata?: Json
          notes?: string | null
          paid_amount?: number
          remaining_amount?: number | null
          service_order_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["billing_invoice_status"]
          supplier_id?: string | null
          sync_revision?: number
          total_amount?: number
          type?: Database["public"]["Enums"]["billing_invoice_type"]
          updated_at?: string
          vehicle_id?: string | null
          visibility_scope?: string
          workspace_id?: string | null
          year_reference?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_invoices_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "billing_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_payment_methods: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      billing_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string
          notes: string | null
          payment_date: string
          payment_method_id: string | null
          reconciliation_id: string | null
          reference: string | null
          status: Database["public"]["Enums"]["billing_payment_status"]
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id: string
          notes?: string | null
          payment_date?: string
          payment_method_id?: string | null
          reconciliation_id?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["billing_payment_status"]
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string
          notes?: string | null
          payment_date?: string
          payment_method_id?: string | null
          reconciliation_id?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["billing_payment_status"]
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "billing_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_payments_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "billing_payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_payments_reconciliation_id_fkey"
            columns: ["reconciliation_id"]
            isOneToOne: false
            referencedRelation: "billing_reconciliations"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_profiles: {
        Row: {
          billing_address: string | null
          billing_email: string
          city: string | null
          company_name: string | null
          country: string
          created_at: string
          id: string
          is_business: boolean
          legal_name: string
          postal_code: string | null
          preferred_currency: string
          updated_at: string
          vat_number: string | null
          workspace_id: string
        }
        Insert: {
          billing_address?: string | null
          billing_email: string
          city?: string | null
          company_name?: string | null
          country?: string
          created_at?: string
          id?: string
          is_business?: boolean
          legal_name: string
          postal_code?: string | null
          preferred_currency?: string
          updated_at?: string
          vat_number?: string | null
          workspace_id: string
        }
        Update: {
          billing_address?: string | null
          billing_email?: string
          city?: string | null
          company_name?: string | null
          country?: string
          created_at?: string
          id?: string
          is_business?: boolean
          legal_name?: string
          postal_code?: string | null
          preferred_currency?: string
          updated_at?: string
          vat_number?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_reconciliations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          reconciliation_date: string
          reference: string | null
          status: Database["public"]["Enums"]["billing_reconciliation_status"]
          total_amount: number
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          reconciliation_date?: string
          reference?: string | null
          status?: Database["public"]["Enums"]["billing_reconciliation_status"]
          total_amount?: number
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          reconciliation_date?: string
          reference?: string | null
          status?: Database["public"]["Enums"]["billing_reconciliation_status"]
          total_amount?: number
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      billing_suppliers: {
        Row: {
          address: string | null
          bank: string | null
          category: string | null
          created_at: string
          created_by: string | null
          document_number: string | null
          email: string | null
          iban: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          tax_id: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          address?: string | null
          bank?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          document_number?: string | null
          email?: string | null
          iban?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          address?: string | null
          bank?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          document_number?: string | null
          email?: string | null
          iban?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_reason: string | null
          display_code: string | null
          id: string
          name: string
          notes: string | null
          updated_at: string
          user_id: string | null
          visibility_scope: string
          workspace_id: string | null
        }
        Insert: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          display_code?: string | null
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
          user_id?: string | null
          visibility_scope?: string
          workspace_id?: string | null
        }
        Update: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          display_code?: string | null
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string | null
          visibility_scope?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          address: string
          bank_name: string | null
          brand_config: Json | null
          city: string | null
          company_email: string | null
          company_name: string
          company_phone: string | null
          company_share: number
          country: string | null
          created_at: string
          iban: string | null
          id: string
          logo_url: string
          partner_share: number
          postal_code: string | null
          siret: string
          street_name: string | null
          street_number: string | null
          swift_bic: string | null
          tech_share: number
          tva_number: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string
          bank_name?: string | null
          brand_config?: Json | null
          city?: string | null
          company_email?: string | null
          company_name?: string
          company_phone?: string | null
          company_share?: number
          country?: string | null
          created_at?: string
          iban?: string | null
          id?: string
          logo_url?: string
          partner_share?: number
          postal_code?: string | null
          siret?: string
          street_name?: string | null
          street_number?: string | null
          swift_bic?: string | null
          tech_share?: number
          tva_number?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          bank_name?: string | null
          brand_config?: Json | null
          city?: string | null
          company_email?: string | null
          company_name?: string
          company_phone?: string | null
          company_share?: number
          country?: string | null
          created_at?: string
          iban?: string | null
          id?: string
          logo_url?: string
          partner_share?: number
          postal_code?: string | null
          siret?: string
          street_name?: string | null
          street_number?: string | null
          swift_bic?: string | null
          tech_share?: number
          tva_number?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      discrepancies: {
        Row: {
          created_at: string
          expected_value: number | null
          id: string
          issue_type: string
          payment_order_id: string | null
          received_value: number | null
          resolved: boolean
          resolved_at: string | null
          service_order_id: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          expected_value?: number | null
          id?: string
          issue_type: string
          payment_order_id?: string | null
          received_value?: number | null
          resolved?: boolean
          resolved_at?: string | null
          service_order_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          expected_value?: number | null
          id?: string
          issue_type?: string
          payment_order_id?: string | null
          received_value?: number | null
          resolved?: boolean
          resolved_at?: string | null
          service_order_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discrepancies_payment_order_id_fkey"
            columns: ["payment_order_id"]
            isOneToOne: false
            referencedRelation: "payment_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discrepancies_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          display_name: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          mime_type: string | null
          module: string
          name: string
          parent_id: string | null
          rotation: number
          service_order_id: string | null
          size_bytes: number | null
          storage_path: string | null
          type: string
          updated_at: string
          uploaded_by: string | null
          validated: boolean
          visibility_scope: string
          visual_state: Json
          workspace_id: string | null
          zoom: number
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          mime_type?: string | null
          module?: string
          name: string
          parent_id?: string | null
          rotation?: number
          service_order_id?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          type?: string
          updated_at?: string
          uploaded_by?: string | null
          validated?: boolean
          visibility_scope?: string
          visual_state?: Json
          workspace_id?: string | null
          zoom?: number
        }
        Update: {
          created_at?: string
          display_name?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          mime_type?: string | null
          module?: string
          name?: string
          parent_id?: string | null
          rotation?: number
          service_order_id?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          type?: string
          updated_at?: string
          uploaded_by?: string | null
          validated?: boolean
          visibility_scope?: string
          visual_state?: Json
          workspace_id?: string | null
          zoom?: number
        }
        Relationships: [
          {
            foreignKeyName: "documents_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          address: string | null
          birth_date: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_reason: string | null
          email: string | null
          full_name: string
          id: string
          license_category: string | null
          license_expiry_date: string | null
          license_number: string | null
          linked_user_id: string | null
          phone: string | null
          status: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          email?: string | null
          full_name: string
          id?: string
          license_category?: string | null
          license_expiry_date?: string | null
          license_number?: string | null
          linked_user_id?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          email?: string | null
          full_name?: string
          id?: string
          license_category?: string | null
          license_expiry_date?: string | null
          license_number?: string | null
          linked_user_id?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      dunning_events: {
        Row: {
          days_overdue: number
          id: string
          invoice_id: string | null
          notified: boolean
          stage: string
          triggered_at: string
          workspace_id: string
        }
        Insert: {
          days_overdue: number
          id?: string
          invoice_id?: string | null
          notified?: boolean
          stage: string
          triggered_at?: string
          workspace_id: string
        }
        Update: {
          days_overdue?: number
          id?: string
          invoice_id?: string | null
          notified?: boolean
          stage?: string
          triggered_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dunning_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "platform_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dunning_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_entries: {
        Row: {
          amount_paid: number
          created_at: string
          created_by: string | null
          id: string
          service_order_id: string
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          id?: string
          service_order_id: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          id?: string
          service_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_entries_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_events: {
        Row: {
          actor_user_id: string | null
          caused_by_event_id: string | null
          correlation_id: string | null
          created_at: string
          created_by_trigger: string | null
          entity_id: string | null
          entity_type: string
          event_hash: string | null
          event_revision: number
          event_type: string
          id: string
          payload: Json
          processing_key: string | null
          workspace_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          caused_by_event_id?: string | null
          correlation_id?: string | null
          created_at?: string
          created_by_trigger?: string | null
          entity_id?: string | null
          entity_type: string
          event_hash?: string | null
          event_revision?: number
          event_type: string
          id?: string
          payload?: Json
          processing_key?: string | null
          workspace_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          caused_by_event_id?: string | null
          correlation_id?: string | null
          created_at?: string
          created_by_trigger?: string | null
          entity_id?: string | null
          entity_type?: string
          event_hash?: string | null
          event_revision?: number
          event_type?: string
          id?: string
          payload?: Json
          processing_key?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      financial_integrity_issues: {
        Row: {
          created_at: string
          created_by_system: string
          details_json: Json
          detected_at: string
          entity_id: string | null
          entity_type: string | null
          hash: string | null
          id: string
          issue_type: Database["public"]["Enums"]["integrity_issue_type"]
          reference_id: string | null
          resolved_at: string | null
          severity: Database["public"]["Enums"]["integrity_severity"]
          status: Database["public"]["Enums"]["integrity_status"]
          updated_at: string
          workspace_id: string | null
          year_reference: number | null
        }
        Insert: {
          created_at?: string
          created_by_system?: string
          details_json?: Json
          detected_at?: string
          entity_id?: string | null
          entity_type?: string | null
          hash?: string | null
          id?: string
          issue_type: Database["public"]["Enums"]["integrity_issue_type"]
          reference_id?: string | null
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["integrity_severity"]
          status?: Database["public"]["Enums"]["integrity_status"]
          updated_at?: string
          workspace_id?: string | null
          year_reference?: number | null
        }
        Update: {
          created_at?: string
          created_by_system?: string
          details_json?: Json
          detected_at?: string
          entity_id?: string | null
          entity_type?: string | null
          hash?: string | null
          id?: string
          issue_type?: Database["public"]["Enums"]["integrity_issue_type"]
          reference_id?: string | null
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["integrity_severity"]
          status?: Database["public"]["Enums"]["integrity_status"]
          updated_at?: string
          workspace_id?: string | null
          year_reference?: number | null
        }
        Relationships: []
      }
      financial_integrity_snapshots: {
        Row: {
          created_at: string
          id: string
          snapshot_hash: string | null
          snapshot_type: string
          total_distributed: number
          total_expected: number
          total_expenses: number
          total_op: number
          total_os: number
          total_pending: number
          total_profit: number
          total_received: number
          workspace_id: string | null
          year_reference: number
        }
        Insert: {
          created_at?: string
          id?: string
          snapshot_hash?: string | null
          snapshot_type?: string
          total_distributed?: number
          total_expected?: number
          total_expenses?: number
          total_op?: number
          total_os?: number
          total_pending?: number
          total_profit?: number
          total_received?: number
          workspace_id?: string | null
          year_reference: number
        }
        Update: {
          created_at?: string
          id?: string
          snapshot_hash?: string | null
          snapshot_type?: string
          total_distributed?: number
          total_expected?: number
          total_expenses?: number
          total_op?: number
          total_os?: number
          total_pending?: number
          total_profit?: number
          total_received?: number
          workspace_id?: string | null
          year_reference?: number
        }
        Relationships: []
      }
      financial_records: {
        Row: {
          amount: number
          assigned_user_id: string | null
          category: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_reason: string | null
          id: string
          label: string | null
          notes: string | null
          origin: string
          payment_order_id: string | null
          reference_id: string | null
          service_order_id: string | null
          source: string
          status: string
          technician_id: string | null
          type: string
          user_id: string | null
          vehicle_id: string | null
          visibility_scope: string
          workspace_id: string | null
          year_reference: number | null
        }
        Insert: {
          amount?: number
          assigned_user_id?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          id?: string
          label?: string | null
          notes?: string | null
          origin?: string
          payment_order_id?: string | null
          reference_id?: string | null
          service_order_id?: string | null
          source: string
          status?: string
          technician_id?: string | null
          type: string
          user_id?: string | null
          vehicle_id?: string | null
          visibility_scope?: string
          workspace_id?: string | null
          year_reference?: number | null
        }
        Update: {
          amount?: number
          assigned_user_id?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          id?: string
          label?: string | null
          notes?: string | null
          origin?: string
          payment_order_id?: string | null
          reference_id?: string | null
          service_order_id?: string | null
          source?: string
          status?: string
          technician_id?: string | null
          type?: string
          user_id?: string | null
          vehicle_id?: string | null
          visibility_scope?: string
          workspace_id?: string | null
          year_reference?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_records_payment_order_id_fkey"
            columns: ["payment_order_id"]
            isOneToOne: false
            referencedRelation: "payment_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_records_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_records_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_state_snapshots: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          revision: number
          snapshot_data: Json
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          revision?: number
          snapshot_data?: Json
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          revision?: number
          snapshot_data?: Json
          workspace_id?: string | null
        }
        Relationships: []
      }
      fleet_fuel_logs: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          deleted_at: string | null
          deleted_by: string | null
          deleted_reason: string | null
          driver_id: string | null
          id: string
          km_at_fuel: number | null
          liters: number
          notes: string | null
          price_per_liter: number | null
          receipt_storage_path: string | null
          total_cost: number
          vehicle_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          driver_id?: string | null
          id?: string
          km_at_fuel?: number | null
          liters?: number
          notes?: string | null
          price_per_liter?: number | null
          receipt_storage_path?: string | null
          total_cost?: number
          vehicle_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          driver_id?: string | null
          id?: string
          km_at_fuel?: number | null
          liters?: number
          notes?: string | null
          price_per_liter?: number | null
          receipt_storage_path?: string | null
          total_cost?: number
          vehicle_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_fuel_logs_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_fuel_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_trip_points: {
        Row: {
          address: string | null
          city: string | null
          distance_from_previous: number | null
          duration_from_previous: number | null
          id: string
          latitude: number | null
          longitude: number | null
          order_index: number
          postal_code: string | null
          recorded_at: string
          trip_id: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          distance_from_previous?: number | null
          duration_from_previous?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          order_index?: number
          postal_code?: string | null
          recorded_at?: string
          trip_id: string
        }
        Update: {
          address?: string | null
          city?: string | null
          distance_from_previous?: number | null
          duration_from_previous?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          order_index?: number
          postal_code?: string | null
          recorded_at?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_trip_points_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "fleet_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_trips: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          deleted_at: string | null
          deleted_by: string | null
          deleted_reason: string | null
          driver_id: string
          id: string
          km_end: number | null
          km_start: number | null
          notes: string | null
          status: string
          total_distance: number | null
          total_duration: number | null
          updated_at: string
          vehicle_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          driver_id: string
          id?: string
          km_end?: number | null
          km_start?: number | null
          notes?: string | null
          status?: string
          total_distance?: number | null
          total_duration?: number | null
          updated_at?: string
          vehicle_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          driver_id?: string
          id?: string
          km_end?: number | null
          km_start?: number | null
          notes?: string | null
          status?: string
          total_distance?: number | null
          total_duration?: number | null
          updated_at?: string
          vehicle_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_trips_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_trips_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_receipts: {
        Row: {
          amount: number
          created_at: string
          file_name: string
          file_url: string
          id: string
          storage_path: string | null
          usage_log_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          file_name?: string
          file_url: string
          id?: string
          storage_path?: string | null
          usage_log_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          file_name?: string
          file_url?: string
          id?: string
          storage_path?: string | null
          usage_log_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_receipts_usage_log_id_fkey"
            columns: ["usage_log_id"]
            isOneToOne: false
            referencedRelation: "vehicle_usage_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      hail_events: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          external_id: string | null
          forecast_time: string | null
          hail_size_mm: number | null
          id: string
          intensity: number | null
          is_demo: boolean
          lat: number
          lng: number
          metadata: Json
          observed_time: string | null
          probability: number | null
          radius_km: number
          region: string | null
          severity: string
          source: string
          status: string
          storm_direction_deg: number | null
          storm_speed_kmh: number | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          external_id?: string | null
          forecast_time?: string | null
          hail_size_mm?: number | null
          id?: string
          intensity?: number | null
          is_demo?: boolean
          lat: number
          lng: number
          metadata?: Json
          observed_time?: string | null
          probability?: number | null
          radius_km?: number
          region?: string | null
          severity?: string
          source?: string
          status?: string
          storm_direction_deg?: number | null
          storm_speed_kmh?: number | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          external_id?: string | null
          forecast_time?: string | null
          hail_size_mm?: number | null
          id?: string
          intensity?: number | null
          is_demo?: boolean
          lat?: number
          lng?: number
          metadata?: Json
          observed_time?: string | null
          probability?: number | null
          radius_km?: number
          region?: string | null
          severity?: string
          source?: string
          status?: string
          storm_direction_deg?: number | null
          storm_speed_kmh?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      hail_reports: {
        Row: {
          city: string | null
          confidence_score: number
          corroboration_count: number
          country: string | null
          created_at: string
          hail_event_id: string | null
          hail_size_mm: number | null
          id: string
          lat: number
          lng: number
          metadata: Json
          notes: string | null
          observed_at: string
          photo_storage_path: string | null
          photo_url: string | null
          region: string | null
          reporter_user_id: string | null
          severity: string
          status: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          city?: string | null
          confidence_score?: number
          corroboration_count?: number
          country?: string | null
          created_at?: string
          hail_event_id?: string | null
          hail_size_mm?: number | null
          id?: string
          lat: number
          lng: number
          metadata?: Json
          notes?: string | null
          observed_at?: string
          photo_storage_path?: string | null
          photo_url?: string | null
          region?: string | null
          reporter_user_id?: string | null
          severity?: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          city?: string | null
          confidence_score?: number
          corroboration_count?: number
          country?: string | null
          created_at?: string
          hail_event_id?: string | null
          hail_size_mm?: number | null
          id?: string
          lat?: number
          lng?: number
          metadata?: Json
          notes?: string | null
          observed_at?: string
          photo_storage_path?: string | null
          photo_url?: string | null
          region?: string | null
          reporter_user_id?: string | null
          severity?: string
          status?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hail_reports_hail_event_id_fkey"
            columns: ["hail_event_id"]
            isOneToOne: false
            referencedRelation: "hail_events"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          email: string | null
          expires_at: string | null
          id: string
          invite_type: string
          role: Database["public"]["Enums"]["membership_role"]
          short_code: string | null
          token: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by: string
          email?: string | null
          expires_at?: string | null
          id?: string
          invite_type?: string
          role?: Database["public"]["Enums"]["membership_role"]
          short_code?: string | null
          token?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          expires_at?: string | null
          id?: string
          invite_type?: string
          role?: Database["public"]["Enums"]["membership_role"]
          short_code?: string | null
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_send_log: {
        Row: {
          body: string | null
          cc: string | null
          created_at: string
          error: string | null
          id: string
          idempotency_key: string | null
          invoice_id: string
          kind: string
          pdf_path: string | null
          provider: string
          recipient: string
          sent_at: string | null
          sent_by: string | null
          status: string
          subject: string
        }
        Insert: {
          body?: string | null
          cc?: string | null
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key?: string | null
          invoice_id: string
          kind?: string
          pdf_path?: string | null
          provider?: string
          recipient: string
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          subject: string
        }
        Update: {
          body?: string | null
          cc?: string | null
          created_at?: string
          error?: string | null
          id?: string
          idempotency_key?: string | null
          invoice_id?: string
          kind?: string
          pdf_path?: string | null
          provider?: string
          recipient?: string
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_send_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "billing_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_bank_transfers: {
        Row: {
          amount: number
          bank_account_id: string | null
          currency: string
          declared_at: string
          id: string
          invoice_id: string | null
          reference_code: string
          reviewed_at: string | null
          reviewer_notes: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          currency?: string
          declared_at?: string
          id?: string
          invoice_id?: string | null
          reference_code: string
          reviewed_at?: string | null
          reviewer_notes?: string | null
          status?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          currency?: string
          declared_at?: string
          id?: string
          invoice_id?: string | null
          reference_code?: string
          reviewed_at?: string | null
          reviewer_notes?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_bank_transfers_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "platform_bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_bank_transfers_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "platform_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_bank_transfers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["membership_role"]
          source: string
          status: Database["public"]["Enums"]["membership_status"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["membership_role"]
          source?: string
          status?: Database["public"]["Enums"]["membership_status"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["membership_role"]
          source?: string
          status?: Database["public"]["Enums"]["membership_status"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      mileage_logs: {
        Row: {
          created_at: string
          date: string
          driver_user_id: string | null
          end_km: number
          fuel_cost: number | null
          fuel_litres: number | null
          id: string
          notes: string | null
          start_km: number
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          driver_user_id?: string | null
          end_km: number
          fuel_cost?: number | null
          fuel_litres?: number | null
          id?: string
          notes?: string | null
          start_km: number
          vehicle_id: string
        }
        Update: {
          created_at?: string
          date?: string
          driver_user_id?: string | null
          end_km?: number
          fuel_cost?: number | null
          fuel_litres?: number | null
          id?: string
          notes?: string | null
          start_km?: number
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mileage_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean
          message: string | null
          title: string
          type: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          message?: string | null
          title: string
          type?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          message?: string | null
          title?: string
          type?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      participation_diffs: {
        Row: {
          created_at: string
          event_hash: string | null
          id: string
          ledger_id: string | null
          new_expected: number | null
          new_received: number | null
          new_status: string | null
          participant_name: string | null
          participant_type: string | null
          previous_expected: number | null
          previous_received: number | null
          previous_status: string | null
          service_order_id: string | null
          sync_revision: number | null
          workspace_id: string | null
          year_reference: number | null
        }
        Insert: {
          created_at?: string
          event_hash?: string | null
          id?: string
          ledger_id?: string | null
          new_expected?: number | null
          new_received?: number | null
          new_status?: string | null
          participant_name?: string | null
          participant_type?: string | null
          previous_expected?: number | null
          previous_received?: number | null
          previous_status?: string | null
          service_order_id?: string | null
          sync_revision?: number | null
          workspace_id?: string | null
          year_reference?: number | null
        }
        Update: {
          created_at?: string
          event_hash?: string | null
          id?: string
          ledger_id?: string | null
          new_expected?: number | null
          new_received?: number | null
          new_status?: string | null
          participant_name?: string | null
          participant_type?: string | null
          previous_expected?: number | null
          previous_received?: number | null
          previous_status?: string | null
          service_order_id?: string | null
          sync_revision?: number | null
          workspace_id?: string | null
          year_reference?: number | null
        }
        Relationships: []
      }
      participation_ledger: {
        Row: {
          created_at: string
          expected_amount: number
          id: string
          last_event_hash: string | null
          participant_name: string
          participant_type: string
          participant_user_id: string | null
          pending_amount: number | null
          percentage: number
          received_amount: number
          rule_item_id: string | null
          service_order_id: string
          status: string
          sync_revision: number
          updated_at: string
          workspace_id: string | null
          year_reference: number | null
        }
        Insert: {
          created_at?: string
          expected_amount?: number
          id?: string
          last_event_hash?: string | null
          participant_name: string
          participant_type?: string
          participant_user_id?: string | null
          pending_amount?: number | null
          percentage?: number
          received_amount?: number
          rule_item_id?: string | null
          service_order_id: string
          status?: string
          sync_revision?: number
          updated_at?: string
          workspace_id?: string | null
          year_reference?: number | null
        }
        Update: {
          created_at?: string
          expected_amount?: number
          id?: string
          last_event_hash?: string | null
          participant_name?: string
          participant_type?: string
          participant_user_id?: string | null
          pending_amount?: number | null
          percentage?: number
          received_amount?: number
          rule_item_id?: string | null
          service_order_id?: string
          status?: string
          sync_revision?: number
          updated_at?: string
          workspace_id?: string | null
          year_reference?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "participation_ledger_rule_item_id_fkey"
            columns: ["rule_item_id"]
            isOneToOne: false
            referencedRelation: "profit_rule_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participation_ledger_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_clients: {
        Row: {
          client_id: string
          id: string
          partner_user_id: string
        }
        Insert: {
          client_id: string
          id?: string
          partner_user_id: string
        }
        Update: {
          client_id?: string
          id?: string
          partner_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_attempts: {
        Row: {
          attempt_number: number
          attempted_at: string | null
          created_at: string
          failure_reason: string | null
          id: string
          invoice_id: string | null
          scheduled_at: string
          status: string
          workspace_id: string
        }
        Insert: {
          attempt_number?: number
          attempted_at?: string | null
          created_at?: string
          failure_reason?: string | null
          id?: string
          invoice_id?: string | null
          scheduled_at: string
          status?: string
          workspace_id: string
        }
        Update: {
          attempt_number?: number
          attempted_at?: string | null
          created_at?: string
          failure_reason?: string | null
          id?: string
          invoice_id?: string | null
          scheduled_at?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "platform_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_attempts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          brand: string | null
          created_at: string
          holder_name: string | null
          iban_masked: string | null
          id: string
          is_default: boolean
          kind: string
          last4: string | null
          provider: string
          provider_ref: string | null
          workspace_id: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          holder_name?: string | null
          iban_masked?: string | null
          id?: string
          is_default?: boolean
          kind: string
          last4?: string | null
          provider?: string
          provider_ref?: string | null
          workspace_id: string
        }
        Update: {
          brand?: string | null
          created_at?: string
          holder_name?: string | null
          iban_masked?: string | null
          id?: string
          is_default?: boolean
          kind?: string
          last4?: string | null
          provider?: string
          provider_ref?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_orders: {
        Row: {
          amount_paid: number
          assigned_user_id: string
          car_name: string | null
          client_id: string | null
          client_name: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_reason: string | null
          group_id: string | null
          id: string
          license_plate: string | null
          list_name: string | null
          operational_unit: string | null
          platform: string | null
          service_order_id: string | null
          services: Json | null
          status: string
          technician_id: string | null
          technician_name: string | null
          total: number | null
          updated_at: string
          user_id: string
          visibility_scope: string
          workspace_id: string | null
          year_reference: number | null
        }
        Insert: {
          amount_paid?: number
          assigned_user_id: string
          car_name?: string | null
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          group_id?: string | null
          id?: string
          license_plate?: string | null
          list_name?: string | null
          operational_unit?: string | null
          platform?: string | null
          service_order_id?: string | null
          services?: Json | null
          status?: string
          technician_id?: string | null
          technician_name?: string | null
          total?: number | null
          updated_at?: string
          user_id: string
          visibility_scope?: string
          workspace_id?: string | null
          year_reference?: number | null
        }
        Update: {
          amount_paid?: number
          assigned_user_id?: string
          car_name?: string | null
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          group_id?: string | null
          id?: string
          license_plate?: string | null
          list_name?: string | null
          operational_unit?: string | null
          platform?: string | null
          service_order_id?: string | null
          services?: Json | null
          status?: string
          technician_id?: string | null
          technician_name?: string | null
          total?: number | null
          updated_at?: string
          user_id?: string
          visibility_scope?: string
          workspace_id?: string | null
          year_reference?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_orders_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_orders_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          created_at: string
          id: string
          label: string | null
          module: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          label?: string | null
          module: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          label?: string | null
          module?: string
        }
        Relationships: []
      }
      platform_bank_accounts: {
        Row: {
          account_name: string
          account_type: string
          active: boolean
          bank_name: string
          bic: string | null
          country: string
          created_at: string
          currency: string
          iban: string | null
          id: string
          is_primary: boolean
          notes: string | null
          supported_methods: string[]
          updated_at: string
        }
        Insert: {
          account_name: string
          account_type?: string
          active?: boolean
          bank_name: string
          bic?: string | null
          country?: string
          created_at?: string
          currency?: string
          iban?: string | null
          id?: string
          is_primary?: boolean
          notes?: string | null
          supported_methods?: string[]
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_type?: string
          active?: boolean
          bank_name?: string
          bic?: string | null
          country?: string
          created_at?: string
          currency?: string
          iban?: string | null
          id?: string
          is_primary?: boolean
          notes?: string | null
          supported_methods?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      platform_invoice_items: {
        Row: {
          amount: number
          created_at: string
          description: string
          id: string
          invoice_id: string
          quantity: number
          sort_order: number
          unit_price: number
          vat_rate: number
        }
        Insert: {
          amount?: number
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          quantity?: number
          sort_order?: number
          unit_price?: number
          vat_rate?: number
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          sort_order?: number
          unit_price?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "platform_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "platform_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_invoices: {
        Row: {
          created_at: string
          currency: string
          customer_address: Json | null
          customer_country: string | null
          customer_is_business: boolean
          customer_name: string | null
          customer_vat_number: string | null
          cycle_id: string | null
          due_date: string
          id: string
          invoice_number: string
          issue_date: string
          metadata: Json
          paid_at: string | null
          pdf_url: string | null
          status: string
          subscription_id: string | null
          subtotal: number
          total: number
          updated_at: string
          vat_amount: number
          vat_exemption_reason: string | null
          vat_rate: number
          vat_reverse_charge: boolean
          workspace_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          customer_address?: Json | null
          customer_country?: string | null
          customer_is_business?: boolean
          customer_name?: string | null
          customer_vat_number?: string | null
          cycle_id?: string | null
          due_date?: string
          id?: string
          invoice_number: string
          issue_date?: string
          metadata?: Json
          paid_at?: string | null
          pdf_url?: string | null
          status?: string
          subscription_id?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
          vat_amount?: number
          vat_exemption_reason?: string | null
          vat_rate?: number
          vat_reverse_charge?: boolean
          workspace_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          customer_address?: Json | null
          customer_country?: string | null
          customer_is_business?: boolean
          customer_name?: string | null
          customer_vat_number?: string | null
          cycle_id?: string | null
          due_date?: string
          id?: string
          invoice_number?: string
          issue_date?: string
          metadata?: Json
          paid_at?: string | null
          pdf_url?: string | null
          status?: string
          subscription_id?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
          vat_amount?: number
          vat_exemption_reason?: string | null
          vat_rate?: number
          vat_reverse_charge?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_invoices_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "platform_subscription_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_owners: {
        Row: {
          created_at: string
          email: string
          notes: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          notes?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
      platform_payment_methods: {
        Row: {
          code: string
          config: Json
          created_at: string
          display_order: number
          enabled: boolean
          id: string
          label: string
          updated_at: string
        }
        Insert: {
          code: string
          config?: Json
          created_at?: string
          display_order?: number
          enabled?: boolean
          id?: string
          label: string
          updated_at?: string
        }
        Update: {
          code?: string
          config?: Json
          created_at?: string
          display_order?: number
          enabled?: boolean
          id?: string
          label?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_subscription_cycles: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          invoice_id: string | null
          period_end: string
          period_start: string
          status: string
          subscription_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          invoice_id?: string | null
          period_end: string
          period_start: string
          status?: string
          subscription_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          invoice_id?: string | null
          period_end?: string
          period_start?: string
          status?: string
          subscription_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      platform_subscription_payments: {
        Row: {
          amount: number
          bank_account_id: string | null
          created_at: string
          currency: string
          cycle_id: string | null
          error_message: string | null
          external_ref: string | null
          id: string
          invoice_id: string | null
          metadata: Json
          method: string
          processed_at: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          created_at?: string
          currency?: string
          cycle_id?: string | null
          error_message?: string | null
          external_ref?: string | null
          id?: string
          invoice_id?: string | null
          metadata?: Json
          method?: string
          processed_at?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          created_at?: string
          currency?: string
          cycle_id?: string | null
          error_message?: string | null
          external_ref?: string | null
          id?: string
          invoice_id?: string | null
          metadata?: Json
          method?: string
          processed_at?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_subscription_payments_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "platform_bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_subscription_payments_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "platform_subscription_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_vat_rules: {
        Row: {
          country: string
          created_at: string
          eu_member: boolean
          id: string
          notes: string | null
          reverse_charge_when_business: boolean
          standard_rate: number
          updated_at: string
        }
        Insert: {
          country: string
          created_at?: string
          eu_member?: boolean
          id?: string
          notes?: string | null
          reverse_charge_when_business?: boolean
          standard_rate?: number
          updated_at?: string
        }
        Update: {
          country?: string
          created_at?: string
          eu_member?: boolean
          id?: string
          notes?: string | null
          reverse_charge_when_business?: boolean
          standard_rate?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_webhook_events: {
        Row: {
          attempts: number
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          payload: Json
          processed_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          event_type: string
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          event_type?: string
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          status?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          avatar_url: string | null
          created_at: string
          display_code: string | null
          email: string | null
          full_name: string
          id: string
          is_system_owner: boolean
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          created_at?: string
          display_code?: string | null
          email?: string | null
          full_name?: string
          id: string
          is_system_owner?: boolean
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          created_at?: string
          display_code?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_system_owner?: boolean
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profit_distributions: {
        Row: {
          company_share: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          partner_share: number
          scope: string
          target_order_id: string | null
          target_user_id: string | null
          tech_share: number
          updated_at: string
        }
        Insert: {
          company_share?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          partner_share?: number
          scope?: string
          target_order_id?: string | null
          target_user_id?: string | null
          tech_share?: number
          updated_at?: string
        }
        Update: {
          company_share?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          partner_share?: number
          scope?: string
          target_order_id?: string | null
          target_user_id?: string | null
          tech_share?: number
          updated_at?: string
        }
        Relationships: []
      }
      profit_rule_items: {
        Row: {
          created_at: string
          id: string
          participant_name: string
          participant_type: string
          percentage: number
          rule_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          participant_name: string
          participant_type?: string
          percentage?: number
          rule_id: string
        }
        Update: {
          created_at?: string
          id?: string
          participant_name?: string
          participant_type?: string
          percentage?: number
          rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profit_rule_items_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "profit_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      profit_rules: {
        Row: {
          assigned_user_id: string | null
          created_at: string
          created_by: string | null
          group_ids: string[] | null
          id: string
          is_active: boolean
          rule_name: string
          technician_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_user_id?: string | null
          created_at?: string
          created_by?: string | null
          group_ids?: string[] | null
          id?: string
          is_active?: boolean
          rule_name: string
          technician_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_user_id?: string | null
          created_at?: string
          created_by?: string | null
          group_ids?: string[] | null
          id?: string
          is_active?: boolean
          rule_name?: string
          technician_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profit_rules_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliations: {
        Row: {
          confidence_score: number
          created_at: string
          difference_amount: number
          id: string
          matched_by: string
          notes: string | null
          payment_order_id: string | null
          service_order_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          confidence_score?: number
          created_at?: string
          difference_amount?: number
          id?: string
          matched_by?: string
          notes?: string | null
          payment_order_id?: string | null
          service_order_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          confidence_score?: number
          created_at?: string
          difference_amount?: number
          id?: string
          matched_by?: string
          notes?: string | null
          payment_order_id?: string | null
          service_order_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliations_payment_order_id_fkey"
            columns: ["payment_order_id"]
            isOneToOne: false
            referencedRelation: "payment_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliations_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      rls_validation_logs: {
        Row: {
          after_count: number | null
          before_count: number | null
          check_name: string
          created_at: string
          id: string
          phase: string
          sample: Json | null
        }
        Insert: {
          after_count?: number | null
          before_count?: number | null
          check_name: string
          created_at?: string
          id?: string
          phase: string
          sample?: Json | null
        }
        Update: {
          after_count?: number | null
          before_count?: number | null
          check_name?: string
          created_at?: string
          id?: string
          phase?: string
          sample?: Json | null
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission_id: string
          role: Database["public"]["Enums"]["app_role"]
          scope: Database["public"]["Enums"]["permission_scope"]
        }
        Insert: {
          created_at?: string
          id?: string
          permission_id: string
          role: Database["public"]["Enums"]["app_role"]
          scope?: Database["public"]["Enums"]["permission_scope"]
        }
        Update: {
          created_at?: string
          id?: string
          permission_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          scope?: Database["public"]["Enums"]["permission_scope"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
        ]
      }
      security_events: {
        Row: {
          app_user_id: string | null
          created_at: string
          device: string | null
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json
          resource: string | null
          resource_id: string | null
          risk_score: number
          severity: string
          user_agent: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          app_user_id?: string | null
          created_at?: string
          device?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          resource?: string | null
          resource_id?: string | null
          risk_score?: number
          severity?: string
          user_agent?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          app_user_id?: string | null
          created_at?: string
          device?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          resource?: string | null
          resource_id?: string | null
          risk_score?: number
          severity?: string
          user_agent?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      service_order_distributions: {
        Row: {
          calculated_value: number
          created_at: string
          id: string
          participant_name: string
          percentage: number
          rule_item_id: string | null
          service_order_id: string
        }
        Insert: {
          calculated_value?: number
          created_at?: string
          id?: string
          participant_name: string
          percentage?: number
          rule_item_id?: string | null
          service_order_id: string
        }
        Update: {
          calculated_value?: number
          created_at?: string
          id?: string
          participant_name?: string
          percentage?: number
          rule_item_id?: string | null
          service_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_order_distributions_rule_item_id_fkey"
            columns: ["rule_item_id"]
            isOneToOne: false
            referencedRelation: "profit_rule_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_distributions_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_orders: {
        Row: {
          assigned_user_id: string
          car_name: string | null
          client_id: string | null
          client_name: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_reason: string | null
          distribution_snapshot: Json | null
          group_id: string | null
          id: string
          license_plate: string | null
          operational_unit: string | null
          platform: string | null
          service_1_name: string | null
          service_1_price: number | null
          service_2_name: string | null
          service_2_price: number | null
          service_3_name: string | null
          service_3_price: number | null
          service_4_name: string | null
          service_4_price: number | null
          status: string
          technician_earning: number | null
          technician_id: string | null
          technician_name: string
          technician_percentage: number | null
          total: number | null
          updated_at: string
          user_id: string
          visibility_scope: string
          week: string | null
          workspace_id: string | null
          year_reference: number | null
        }
        Insert: {
          assigned_user_id: string
          car_name?: string | null
          client_id?: string | null
          client_name?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          distribution_snapshot?: Json | null
          group_id?: string | null
          id?: string
          license_plate?: string | null
          operational_unit?: string | null
          platform?: string | null
          service_1_name?: string | null
          service_1_price?: number | null
          service_2_name?: string | null
          service_2_price?: number | null
          service_3_name?: string | null
          service_3_price?: number | null
          service_4_name?: string | null
          service_4_price?: number | null
          status?: string
          technician_earning?: number | null
          technician_id?: string | null
          technician_name?: string
          technician_percentage?: number | null
          total?: number | null
          updated_at?: string
          user_id: string
          visibility_scope?: string
          week?: string | null
          workspace_id?: string | null
          year_reference?: number | null
        }
        Update: {
          assigned_user_id?: string
          car_name?: string | null
          client_id?: string | null
          client_name?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          distribution_snapshot?: Json | null
          group_id?: string | null
          id?: string
          license_plate?: string | null
          operational_unit?: string | null
          platform?: string | null
          service_1_name?: string | null
          service_1_price?: number | null
          service_2_name?: string | null
          service_2_price?: number | null
          service_3_name?: string | null
          service_3_price?: number | null
          service_4_name?: string | null
          service_4_price?: number | null
          status?: string
          technician_earning?: number | null
          technician_id?: string | null
          technician_name?: string
          technician_percentage?: number | null
          total?: number | null
          updated_at?: string
          user_id?: string
          visibility_scope?: string
          week?: string | null
          workspace_id?: string | null
          year_reference?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json
          subscription_id: string | null
          workspace_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          subscription_id?: string | null
          workspace_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          subscription_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "workspace_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          base_price_monthly: number
          base_tech_included: number
          code: string
          created_at: string
          extra_block_price: number
          extra_block_size: number
          id: string
          is_active: boolean
          name: string
          yearly_discount_months: number
        }
        Insert: {
          base_price_monthly?: number
          base_tech_included?: number
          code: string
          created_at?: string
          extra_block_price?: number
          extra_block_size?: number
          id?: string
          is_active?: boolean
          name: string
          yearly_discount_months?: number
        }
        Update: {
          base_price_monthly?: number
          base_tech_included?: number
          code?: string
          created_at?: string
          extra_block_price?: number
          extra_block_size?: number
          id?: string
          is_active?: boolean
          name?: string
          yearly_discount_months?: number
        }
        Relationships: []
      }
      technician_clients: {
        Row: {
          client_id: string
          id: string
          technician_id: string
        }
        Insert: {
          client_id: string
          id?: string
          technician_id: string
        }
        Update: {
          client_id?: string
          id?: string
          technician_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technician_clients_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      technicians: {
        Row: {
          created_at: string
          display_code: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          display_code?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          display_code?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      temp_credentials: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          full_name: string | null
          temp_password: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          expires_at?: string
          full_name?: string | null
          temp_password: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          full_name?: string | null
          temp_password?: string
          user_id?: string
        }
        Relationships: []
      }
      trial_fingerprints: {
        Row: {
          email_normalized: string
          id: string
          ip_hash: string | null
          owner_user_id: string | null
          trial_started_at: string
          workspace_id: string | null
        }
        Insert: {
          email_normalized: string
          id?: string
          ip_hash?: string | null
          owner_user_id?: string | null
          trial_started_at?: string
          workspace_id?: string | null
        }
        Update: {
          email_normalized?: string
          id?: string
          ip_hash?: string | null
          owner_user_id?: string | null
          trial_started_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trial_fingerprints_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_consents: {
        Row: {
          accepted_data_storage: boolean
          accepted_gdpr: boolean
          accepted_privacy: boolean
          accepted_sharing_policy: boolean
          accepted_terms: boolean
          created_at: string
          id: string
          ip_address: string | null
          language: string | null
          revoked_at: string | null
          status: string
          terms_version: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted_data_storage?: boolean
          accepted_gdpr?: boolean
          accepted_privacy?: boolean
          accepted_sharing_policy?: boolean
          accepted_terms?: boolean
          created_at?: string
          id?: string
          ip_address?: string | null
          language?: string | null
          revoked_at?: string | null
          status?: string
          terms_version: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted_data_storage?: boolean
          accepted_gdpr?: boolean
          accepted_privacy?: boolean
          accepted_sharing_policy?: boolean
          accepted_terms?: boolean
          created_at?: string
          id?: string
          ip_address?: string | null
          language?: string | null
          revoked_at?: string | null
          status?: string
          terms_version?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          allow: boolean
          created_at: string
          created_by: string | null
          id: string
          permission_id: string
          scope: Database["public"]["Enums"]["permission_scope"]
          user_id: string
        }
        Insert: {
          allow: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          permission_id: string
          scope?: Database["public"]["Enums"]["permission_scope"]
          user_id: string
        }
        Update: {
          allow?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          permission_id?: string
          scope?: Database["public"]["Enums"]["permission_scope"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          can_view_other_users: boolean
          can_view_workspace_data: boolean
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_view_other_users?: boolean
          can_view_workspace_data?: boolean
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_view_other_users?: boolean
          can_view_workspace_data?: boolean
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_usage: {
        Row: {
          id: string
          last_updated: string
          total_workspaces: number
          user_id: string
        }
        Insert: {
          id?: string
          last_updated?: string
          total_workspaces?: number
          user_id: string
        }
        Update: {
          id?: string
          last_updated?: string
          total_workspaces?: number
          user_id?: string
        }
        Relationships: []
      }
      vehicle_assignments: {
        Row: {
          created_at: string
          driver_id: string | null
          driver_name: string
          end_date: string | null
          id: string
          start_date: string
          status: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          driver_id?: string | null
          driver_name: string
          end_date?: string | null
          id?: string
          start_date?: string
          status?: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          driver_id?: string | null
          driver_name?: string
          end_date?: string | null
          id?: string
          start_date?: string
          status?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_assignments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_assignments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_documents: {
        Row: {
          created_at: string
          doc_type: string
          file_name: string
          file_url: string
          id: string
          storage_path: string | null
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          doc_type?: string
          file_name?: string
          file_url: string
          id?: string
          storage_path?: string | null
          vehicle_id: string
        }
        Update: {
          created_at?: string
          doc_type?: string
          file_name?: string
          file_url?: string
          id?: string
          storage_path?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_documents_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_usage_logs: {
        Row: {
          created_at: string
          date: string
          distance: number | null
          driver_name: string
          end_location: string | null
          fuel_cost: number | null
          id: string
          km_end: number
          km_start: number
          liters: number | null
          start_location: string | null
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          distance?: number | null
          driver_name?: string
          end_location?: string | null
          fuel_cost?: number | null
          id?: string
          km_end: number
          km_start: number
          liters?: number | null
          start_location?: string | null
          vehicle_id: string
        }
        Update: {
          created_at?: string
          date?: string
          distance?: number | null
          driver_name?: string
          end_location?: string | null
          fuel_cost?: number | null
          id?: string
          km_end?: number
          km_start?: number
          liters?: number | null
          start_location?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_usage_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          assigned_technician_id: string | null
          brand: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_reason: string | null
          first_registration_date: string | null
          fuel_type: string | null
          id: string
          insurance_expiry: string | null
          license_plate: string
          model: string | null
          name: string
          notes: string | null
          power: string | null
          status: string | null
          vehicle_type: string | null
          vin_number: string | null
          year: number | null
        }
        Insert: {
          assigned_technician_id?: string | null
          brand?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          first_registration_date?: string | null
          fuel_type?: string | null
          id?: string
          insurance_expiry?: string | null
          license_plate: string
          model?: string | null
          name: string
          notes?: string | null
          power?: string | null
          status?: string | null
          vehicle_type?: string | null
          vin_number?: string | null
          year?: number | null
        }
        Update: {
          assigned_technician_id?: string | null
          brand?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          first_registration_date?: string | null
          fuel_type?: string | null
          id?: string
          insurance_expiry?: string | null
          license_plate?: string
          model?: string | null
          name?: string
          notes?: string | null
          power?: string | null
          status?: string | null
          vehicle_type?: string | null
          vin_number?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_assigned_technician_id_fkey"
            columns: ["assigned_technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      weather_cache: {
        Row: {
          cache_key: string
          capability: string
          created_at: string
          expires_at: string
          payload: Json
          provider: string
          region_key: string
        }
        Insert: {
          cache_key: string
          capability: string
          created_at?: string
          expires_at: string
          payload: Json
          provider: string
          region_key: string
        }
        Update: {
          cache_key?: string
          capability?: string
          created_at?: string
          expires_at?: string
          payload?: Json
          provider?: string
          region_key?: string
        }
        Relationships: []
      }
      weather_providers: {
        Row: {
          api_key_secret_name: string | null
          base_url: string | null
          capabilities: Json
          created_at: string
          enabled: boolean
          id: string
          key: string
          last_called_at: string | null
          last_error: string | null
          last_event_count: number | null
          last_status: string | null
          name: string
          priority: number
          rate_limit_per_min: number
          regions: Json
          request_count_window: number
          requires_api_key: boolean
          updated_at: string
          window_started_at: string | null
        }
        Insert: {
          api_key_secret_name?: string | null
          base_url?: string | null
          capabilities?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          key: string
          last_called_at?: string | null
          last_error?: string | null
          last_event_count?: number | null
          last_status?: string | null
          name: string
          priority?: number
          rate_limit_per_min?: number
          regions?: Json
          request_count_window?: number
          requires_api_key?: boolean
          updated_at?: string
          window_started_at?: string | null
        }
        Update: {
          api_key_secret_name?: string | null
          base_url?: string | null
          capabilities?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          key?: string
          last_called_at?: string | null
          last_error?: string | null
          last_event_count?: number | null
          last_status?: string | null
          name?: string
          priority?: number
          rate_limit_per_min?: number
          regions?: Json
          request_count_window?: number
          requires_api_key?: boolean
          updated_at?: string
          window_started_at?: string | null
        }
        Relationships: []
      }
      weather_sync_runs: {
        Row: {
          capability: string | null
          created_at: string
          duration_ms: number | null
          error: string | null
          events_upserted: number
          id: string
          metadata: Json
          ok: boolean
          provider: string
          region_key: string | null
        }
        Insert: {
          capability?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          events_upserted?: number
          id?: string
          metadata?: Json
          ok: boolean
          provider: string
          region_key?: string | null
        }
        Update: {
          capability?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          events_upserted?: number
          id?: string
          metadata?: Json
          ok?: boolean
          provider?: string
          region_key?: string | null
        }
        Relationships: []
      }
      workspace_limit_snapshots: {
        Row: {
          created_at: string
          delta_price: number
          id: string
          new_count: number
          new_price: number
          previous_count: number
          previous_price: number
          reason: string
          subscription_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          delta_price: number
          id?: string
          new_count: number
          new_price: number
          previous_count: number
          previous_price: number
          reason?: string
          subscription_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          delta_price?: number
          id?: string
          new_count?: number
          new_price?: number
          previous_count?: number
          previous_price?: number
          reason?: string
          subscription_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_limit_snapshots_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "workspace_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_limit_snapshots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_module_permissions: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          module: string
          settings: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          module: string
          settings?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          module?: string
          settings?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_module_permissions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_subscriptions: {
        Row: {
          auto_renew: boolean
          billing_cycle: Database["public"]["Enums"]["billing_cycle"]
          billing_owner_user_id: string | null
          cancelled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          current_price: number
          grace_until: string | null
          id: string
          last_recalculated_at: string | null
          legal_hold: boolean
          metadata: Json
          plan_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          suspension_mode: string | null
          technician_count: number
          trial_ends_at: string
          trial_started_at: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          auto_renew?: boolean
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          billing_owner_user_id?: string | null
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          current_price?: number
          grace_until?: string | null
          id?: string
          last_recalculated_at?: string | null
          legal_hold?: boolean
          metadata?: Json
          plan_id: string
          status?: Database["public"]["Enums"]["subscription_status"]
          suspension_mode?: string | null
          technician_count?: number
          trial_ends_at?: string
          trial_started_at?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          auto_renew?: boolean
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          billing_owner_user_id?: string | null
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          current_price?: number
          grace_until?: string | null
          id?: string
          last_recalculated_at?: string | null
          legal_hold?: boolean
          metadata?: Json
          plan_id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          suspension_mode?: string | null
          technician_count?: number
          trial_ends_at?: string
          trial_started_at?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      financial_event_timeline_v: {
        Row: {
          actor_user_id: string | null
          caused_by_event_id: string | null
          correlation_id: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          event_hash: string | null
          event_type: string | null
          id: string | null
          payload: Json | null
          payload_summary: Json | null
          revision: number | null
          source: string | null
          workspace_id: string | null
          year_reference: number | null
        }
        Insert: {
          actor_user_id?: string | null
          caused_by_event_id?: string | null
          correlation_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_hash?: string | null
          event_type?: string | null
          id?: string | null
          payload?: Json | null
          payload_summary?: never
          revision?: number | null
          source?: string | null
          workspace_id?: string | null
          year_reference?: never
        }
        Update: {
          actor_user_id?: string | null
          caused_by_event_id?: string | null
          correlation_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_hash?: string | null
          event_type?: string | null
          id?: string | null
          payload?: Json | null
          payload_summary?: never
          revision?: number | null
          source?: string | null
          workspace_id?: string | null
          year_reference?: never
        }
        Relationships: []
      }
      recoverable_items: {
        Row: {
          deleted_at: string | null
          deleted_by: string | null
          deleted_reason: string | null
          entity_type: string | null
          id: string | null
          label: string | null
          workspace_id: string | null
        }
        Relationships: []
      }
      v_financial_integrity_summary: {
        Row: {
          critical_issues: number | null
          drift_count: number | null
          last_detected_at: string | null
          open_issues: number | null
          orphan_count: number | null
          resolved_issues: number | null
          warning_issues: number | null
          workspace_id: string | null
          year_reference: number | null
        }
        Relationships: []
      }
      v_participation_summary: {
        Row: {
          expected: number | null
          os_count: number | null
          paid_count: number | null
          partial_count: number | null
          participant_name: string | null
          participant_type: string | null
          participant_user_id: string | null
          pending: number | null
          pending_count: number | null
          received: number | null
          workspace_id: string | null
          year_reference: number | null
        }
        Relationships: []
      }
      v_user_context_self: {
        Row: {
          ctx: Json | null
        }
        Relationships: []
      }
    }
    Functions: {
      _audit_extract_workspace: { Args: { _rec: Json }; Returns: string }
      activate_workspace_subscription: {
        Args: { _cycle: string; _plan_code: string; _workspace_id: string }
        Returns: Json
      }
      active_user_ids: {
        Args: never
        Returns: {
          user_id: string
        }[]
      }
      apply_invite_after_auth: {
        Args: { p_invite_token: string }
        Returns: Json
      }
      apply_order_owner: {
        Args: {
          _created_by: string
          _is_insert: boolean
          _old_assigned_user_id: string
          _old_created_by: string
          _old_user_id: string
          _requested_assigned_user_id: string
          _requested_user_id: string
        }
        Returns: {
          assigned_user_id: string
          created_by: string
          user_id: string
        }[]
      }
      assert_active: { Args: { _uid: string }; Returns: undefined }
      assert_workspace_member: {
        Args: { _workspace_id: string }
        Returns: boolean
      }
      audit_log_purge_older_than: { Args: { _days: number }; Returns: number }
      billing_recalc_invoice: {
        Args: { _invoice_id: string }
        Returns: undefined
      }
      calc_subscription_price: {
        Args: {
          _cycle?: Database["public"]["Enums"]["billing_cycle"]
          _plan_code?: string
          _tech_count: number
        }
        Returns: number
      }
      calculate_technician_cross_workspace_billing: {
        Args: { _user_id: string }
        Returns: Json
      }
      calculate_vat: {
        Args: { _country: string; _is_business?: boolean; _vat_number?: string }
        Returns: Json
      }
      can_access_client: {
        Args: { _client_id: string; _user_id: string }
        Returns: boolean
      }
      can_do: {
        Args: { _action: string; _module: string; _user_id: string }
        Returns: boolean
      }
      can_manage_all_orders: { Args: { _user_id: string }; Returns: boolean }
      check_permission: {
        Args: { _action: string; _module: string; _user_id: string }
        Returns: {
          allowed: boolean
          scope: Database["public"]["Enums"]["permission_scope"]
        }[]
      }
      check_trial_eligibility: { Args: { _email: string }; Returns: Json }
      clear_my_temp_credential: { Args: never; Returns: undefined }
      compute_billing_intelligence: {
        Args: { _workspace_id: string }
        Returns: Json
      }
      compute_platform_smart_metrics: { Args: never; Returns: Json }
      compute_security_metrics: { Args: never; Returns: Json }
      current_user_effective_role: { Args: never; Returns: string }
      current_user_workspace_ids: { Args: never; Returns: string[] }
      deterministic_event_hash: {
        Args: {
          _entity_id: string
          _entity_type: string
          _event_type: string
          _payload: Json
          _revision: number
          _ws: string
        }
        Returns: string
      }
      effective_role: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: string
      }
      emit_financial_event: {
        Args: {
          _entity_id: string
          _entity_type: string
          _event_type: string
          _payload: Json
          _workspace_id: string
        }
        Returns: undefined
      }
      emit_platform_webhook_event: {
        Args: { _event_type: string; _payload?: Json }
        Returns: string
      }
      generate_platform_invoice: {
        Args: {
          _amount?: number
          _bank_account_id?: string
          _cycle: string
          _plan_code: string
          _vat_mode: string
          _workspace_id: string
        }
        Returns: Json
      }
      get_my_role: { Args: never; Returns: string }
      get_my_technician_id: { Args: never; Returns: string }
      get_user_context: { Args: { _workspace_id?: string }; Returns: Json }
      get_user_ownership_map: { Args: { _uid: string }; Returns: Json }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_user_workspaces: {
        Args: { _uid?: string }
        Returns: {
          is_owner: boolean
          role: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      get_workspace_access_state: {
        Args: { _workspace_id: string }
        Returns: Json
      }
      get_workspace_subscription: {
        Args: { _workspace_id: string }
        Returns: Json
      }
      has_global_view: { Args: { _user_id: string }; Returns: boolean }
      has_permission: {
        Args: { _action: string; _module: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_in_workspace: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _uid: string
          _ws: string
        }
        Returns: boolean
      }
      is_order_visible: {
        Args: {
          _assigned: string
          _created_by: string
          _uid: string
          _user_id: string
        }
        Returns: boolean
      }
      is_order_writable: {
        Args: { _uid: string; _user_id: string }
        Returns: boolean
      }
      is_platform_owner: { Args: { _uid?: string }; Returns: boolean }
      is_user_active: { Args: { _user_id: string }; Returns: boolean }
      is_workspace_admin: {
        Args: { _uid?: string; _workspace_id: string }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _uid: string; _ws: string }
        Returns: boolean
      }
      list_audit_events: {
        Args: { _limit?: number; _table_filter?: string }
        Returns: {
          action: string
          actor_user_id: string
          created_at: string
          id: string
          payload: Json
          row_id: string
          table_name: string
        }[]
      }
      list_recoverable_items: {
        Args: never
        Returns: {
          deleted_at: string
          deleted_by: string
          deleted_reason: string
          entity_type: string
          id: string
          label: string
          workspace_id: string
        }[]
      }
      log_audit_event: {
        Args: {
          _new?: Json
          _old?: Json
          _operation: string
          _origin?: string
          _reason?: string
          _row_id?: string
          _table: string
          _workspace?: string
        }
        Returns: string
      }
      log_billing_audit: {
        Args: {
          _action: string
          _category: string
          _message?: string
          _payload?: Json
          _severity?: string
          _subscription_id: string
          _workspace_id: string
        }
        Returns: string
      }
      log_security_event: {
        Args: {
          _event_type: string
          _ip?: string
          _metadata?: Json
          _resource?: string
          _resource_id?: string
          _risk_score?: number
          _severity?: string
          _user_agent?: string
          _workspace_id?: string
        }
        Returns: string
      }
      log_subscription_event: {
        Args: {
          _event_type: string
          _message?: string
          _metadata?: Json
          _severity?: string
          _workspace_id: string
        }
        Returns: string
      }
      next_platform_invoice_number: { Args: never; Returns: string }
      notify_workspace_admins: {
        Args: {
          _entity_id?: string
          _entity_type?: string
          _message: string
          _title: string
          _type: string
          _workspace_id: string
        }
        Returns: number
      }
      owner_filter_uids: { Args: { _uid: string }; Returns: string[] }
      payment_order_has_active_billing: {
        Args: { _op_id: string }
        Returns: boolean
      }
      payment_order_has_invoice: { Args: { _op_id: string }; Returns: boolean }
      process_lifecycle_transitions: { Args: never; Returns: Json }
      process_payment_retries: { Args: never; Returns: Json }
      process_subscription_renewals: { Args: never; Returns: Json }
      recalculate_workspace_subscription: {
        Args: { _workspace_id: string }
        Returns: Json
      }
      replay_financial_state: { Args: { _invoice_id: string }; Returns: Json }
      resolve_participant_user_id: {
        Args: { _participant_type: string; _rule_id: string }
        Returns: string
      }
      restore_audit_record: { Args: { _audit_id: string }; Returns: Json }
      restore_record: {
        Args: { _row_id: string; _table: string }
        Returns: Json
      }
      row_in_scope: {
        Args: {
          _action: string
          _module: string
          _row_created_by: string
          _row_group_id: string
          _user_id: string
        }
        Returns: boolean
      }
      run_dunning_check: { Args: never; Returns: number }
      run_financial_integrity_check: {
        Args: { _workspace_id?: string; _year?: number }
        Returns: Json
      }
      run_subscription_automation: { Args: never; Returns: Json }
      schedule_payment_retries: {
        Args: { _invoice_id: string }
        Returns: number
      }
      soft_delete_record: {
        Args: { _reason?: string; _row_id: string; _table: string }
        Returns: Json
      }
      start_workspace_checkout: {
        Args: { _cycle?: string; _plan_code: string; _workspace_id: string }
        Returns: Json
      }
      sync_discrepancy_for_service_order: {
        Args: { _service_order_id: string }
        Returns: undefined
      }
      sync_financial_received_from_billing: {
        Args: { _invoice_id: string }
        Returns: undefined
      }
      sync_participation_for_invoice: {
        Args: { _invoice_id: string }
        Returns: undefined
      }
      sync_participation_for_so: {
        Args: { _service_order_id: string }
        Returns: undefined
      }
      transition_subscription_status: {
        Args: {
          _new_status: string
          _reason?: string
          _suspension_mode?: string
          _workspace_id: string
        }
        Returns: Json
      }
      user_can_access_module: {
        Args: { _module: string; _uid: string; _ws_id: string }
        Returns: boolean
      }
      user_can_access_workspace: {
        Args: { _uid: string; _ws_id: string }
        Returns: boolean
      }
      user_workspace_ids: { Args: { _uid: string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "partner" | "technician" | "client"
      billing_cycle: "monthly" | "yearly"
      billing_invoice_status:
        | "draft"
        | "pending"
        | "partial"
        | "paid"
        | "overdue"
        | "cancelled"
      billing_invoice_type: "incoming" | "outgoing"
      billing_payment_status: "pending" | "confirmed" | "failed" | "refunded"
      billing_reconciliation_status:
        | "pending"
        | "matched"
        | "partial"
        | "rejected"
        | "divergent"
        | "analyzing"
      integrity_issue_type:
        | "duplicate_event"
        | "orphan_record"
        | "mismatch_total"
        | "invalid_distribution"
        | "stale_summary"
        | "workspace_leak"
        | "year_leak"
        | "negative_balance"
        | "missing_reference"
        | "broken_sync"
        | "invalid_participation"
        | "impossible_amount"
        | "duplicate_hash"
        | "reconciliation_failure"
        | "drift_detected"
      integrity_severity: "info" | "warning" | "critical"
      integrity_status: "open" | "investigating" | "ignored" | "resolved"
      membership_role: "admin" | "tecnico" | "cliente" | "socio"
      membership_status: "active" | "pending"
      permission_scope: "own" | "team" | "all"
      subscription_status:
        | "trial"
        | "active"
        | "grace_period"
        | "overdue"
        | "suspended"
        | "cancelled"
        | "past_due"
        | "legal_hold"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "partner", "technician", "client"],
      billing_cycle: ["monthly", "yearly"],
      billing_invoice_status: [
        "draft",
        "pending",
        "partial",
        "paid",
        "overdue",
        "cancelled",
      ],
      billing_invoice_type: ["incoming", "outgoing"],
      billing_payment_status: ["pending", "confirmed", "failed", "refunded"],
      billing_reconciliation_status: [
        "pending",
        "matched",
        "partial",
        "rejected",
        "divergent",
        "analyzing",
      ],
      integrity_issue_type: [
        "duplicate_event",
        "orphan_record",
        "mismatch_total",
        "invalid_distribution",
        "stale_summary",
        "workspace_leak",
        "year_leak",
        "negative_balance",
        "missing_reference",
        "broken_sync",
        "invalid_participation",
        "impossible_amount",
        "duplicate_hash",
        "reconciliation_failure",
        "drift_detected",
      ],
      integrity_severity: ["info", "warning", "critical"],
      integrity_status: ["open", "investigating", "ignored", "resolved"],
      membership_role: ["admin", "tecnico", "cliente", "socio"],
      membership_status: ["active", "pending"],
      permission_scope: ["own", "team", "all"],
      subscription_status: [
        "trial",
        "active",
        "grace_period",
        "overdue",
        "suspended",
        "cancelled",
        "past_due",
        "legal_hold",
      ],
    },
  },
} as const

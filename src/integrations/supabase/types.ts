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
        }
        Insert: {
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
        }
        Update: {
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
          created_at: string
          created_by: string | null
          customer_name: string | null
          due_date: string | null
          fleet_id: string | null
          id: string
          invoice_number: string
          issue_date: string
          notes: string | null
          paid_amount: number
          remaining_amount: number | null
          service_order_id: string | null
          status: Database["public"]["Enums"]["billing_invoice_status"]
          supplier_id: string | null
          total_amount: number
          type: Database["public"]["Enums"]["billing_invoice_type"]
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          due_date?: string | null
          fleet_id?: string | null
          id?: string
          invoice_number: string
          issue_date?: string
          notes?: string | null
          paid_amount?: number
          remaining_amount?: number | null
          service_order_id?: string | null
          status?: Database["public"]["Enums"]["billing_invoice_status"]
          supplier_id?: string | null
          total_amount?: number
          type?: Database["public"]["Enums"]["billing_invoice_type"]
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          due_date?: string | null
          fleet_id?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          notes?: string | null
          paid_amount?: number
          remaining_amount?: number | null
          service_order_id?: string | null
          status?: Database["public"]["Enums"]["billing_invoice_status"]
          supplier_id?: string | null
          total_amount?: number
          type?: Database["public"]["Enums"]["billing_invoice_type"]
          updated_at?: string
          vehicle_id?: string | null
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
        }
        Relationships: []
      }
      billing_suppliers: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
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
          display_code: string | null
          id: string
          name: string
          notes: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          display_code?: string | null
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          display_code?: string | null
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          address: string
          brand_config: Json | null
          company_name: string
          company_share: number
          created_at: string
          id: string
          logo_url: string
          partner_share: number
          siret: string
          tech_share: number
          tva_number: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string
          brand_config?: Json | null
          company_name?: string
          company_share?: number
          created_at?: string
          id?: string
          logo_url?: string
          partner_share?: number
          siret?: string
          tech_share?: number
          tva_number?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          brand_config?: Json | null
          company_name?: string
          company_share?: number
          created_at?: string
          id?: string
          logo_url?: string
          partner_share?: number
          siret?: string
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
          email: string | null
          full_name: string
          id: string
          license_category: string | null
          license_expiry_date: string | null
          license_number: string | null
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          license_category?: string | null
          license_expiry_date?: string | null
          license_number?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          license_category?: string | null
          license_expiry_date?: string | null
          license_number?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
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
      financial_records: {
        Row: {
          amount: number
          assigned_user_id: string | null
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          notes: string | null
          payment_order_id: string | null
          reference_id: string | null
          service_order_id: string | null
          source: string
          status: string
          technician_id: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          amount?: number
          assigned_user_id?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          notes?: string | null
          payment_order_id?: string | null
          reference_id?: string | null
          service_order_id?: string | null
          source: string
          status?: string
          technician_id?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          assigned_user_id?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          notes?: string | null
          payment_order_id?: string | null
          reference_id?: string | null
          service_order_id?: string | null
          source?: string
          status?: string
          technician_id?: string | null
          type?: string
          user_id?: string | null
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
      fleet_fuel_logs: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          driver_id: string | null
          id: string
          km_at_fuel: number | null
          liters: number
          notes: string | null
          price_per_liter: number | null
          receipt_storage_path: string | null
          total_cost: number
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date?: string
          driver_id?: string | null
          id?: string
          km_at_fuel?: number | null
          liters?: number
          notes?: string | null
          price_per_liter?: number | null
          receipt_storage_path?: string | null
          total_cost?: number
          vehicle_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          driver_id?: string | null
          id?: string
          km_at_fuel?: number | null
          liters?: number
          notes?: string | null
          price_per_liter?: number | null
          receipt_storage_path?: string | null
          total_cost?: number
          vehicle_id?: string
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
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date?: string
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
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
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
        }
        Relationships: []
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
      payment_orders: {
        Row: {
          amount_paid: number
          assigned_user_id: string
          car_name: string | null
          client_id: string | null
          client_name: string | null
          created_at: string
          created_by: string | null
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
        }
        Insert: {
          amount_paid?: number
          assigned_user_id: string
          car_name?: string | null
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
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
        }
        Update: {
          amount_paid?: number
          assigned_user_id?: string
          car_name?: string | null
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
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
      profiles: {
        Row: {
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
          week: string | null
          workspace_id: string | null
        }
        Insert: {
          assigned_user_id: string
          car_name?: string | null
          client_id?: string | null
          client_name?: string
          created_at?: string
          created_by?: string | null
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
          week?: string | null
          workspace_id?: string | null
        }
        Update: {
          assigned_user_id?: string
          car_name?: string | null
          client_id?: string | null
          client_name?: string
          created_at?: string
          created_by?: string | null
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
          week?: string | null
          workspace_id?: string | null
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
      v_user_context_self: {
        Row: {
          ctx: Json | null
        }
        Relationships: []
      }
    }
    Functions: {
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
      current_user_effective_role: { Args: never; Returns: string }
      current_user_workspace_ids: { Args: never; Returns: string[] }
      effective_role: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: string
      }
      get_my_role: { Args: never; Returns: string }
      get_my_technician_id: { Args: never; Returns: string }
      get_user_context: { Args: { _workspace_id?: string }; Returns: Json }
      get_user_ownership_map: { Args: { _uid: string }; Returns: Json }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
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
      is_user_active: { Args: { _user_id: string }; Returns: boolean }
      owner_filter_uids: { Args: { _uid: string }; Returns: string[] }
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
      sync_discrepancy_for_service_order: {
        Args: { _service_order_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "partner" | "technician" | "client"
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
      membership_role: "admin" | "tecnico" | "cliente" | "socio"
      membership_status: "active" | "pending"
      permission_scope: "own" | "team" | "all"
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
      ],
      membership_role: ["admin", "tecnico", "cliente", "socio"],
      membership_status: ["active", "pending"],
      permission_scope: ["own", "team", "all"],
    },
  },
} as const

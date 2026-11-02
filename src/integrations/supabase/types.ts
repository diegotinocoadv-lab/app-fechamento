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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      boloes_estoque: {
        Row: {
          concurso: string
          created_at: string
          criado_por: string | null
          data_sorteio: string | null
          descricao: string | null
          id: string
          situacao: string
          taxa: number
          total_cotas: number
          updated_at: string
          valor_cota: number
        }
        Insert: {
          concurso: string
          created_at?: string
          criado_por?: string | null
          data_sorteio?: string | null
          descricao?: string | null
          id?: string
          situacao?: string
          taxa?: number
          total_cotas?: number
          updated_at?: string
          valor_cota?: number
        }
        Update: {
          concurso?: string
          created_at?: string
          criado_por?: string | null
          data_sorteio?: string | null
          descricao?: string | null
          id?: string
          situacao?: string
          taxa?: number
          total_cotas?: number
          updated_at?: string
          valor_cota?: number
        }
        Relationships: []
      }
      boloes_vendas: {
        Row: {
          bolao_id: string
          canal: Database["public"]["Enums"]["canal_venda"]
          created_at: string
          data: string
          id: string
          observacoes: string | null
          operador_id: string | null
          operador_nome: string | null
          quantidade: number
          updated_at: string
        }
        Insert: {
          bolao_id: string
          canal?: Database["public"]["Enums"]["canal_venda"]
          created_at?: string
          data?: string
          id?: string
          observacoes?: string | null
          operador_id?: string | null
          operador_nome?: string | null
          quantidade?: number
          updated_at?: string
        }
        Update: {
          bolao_id?: string
          canal?: Database["public"]["Enums"]["canal_venda"]
          created_at?: string
          data?: string
          id?: string
          observacoes?: string | null
          operador_id?: string | null
          operador_nome?: string | null
          quantidade?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "boloes_vendas_bolao_id_fkey"
            columns: ["bolao_id"]
            isOneToOne: false
            referencedRelation: "boloes_estoque"
            referencedColumns: ["id"]
          },
        ]
      }
      caixas: {
        Row: {
          created_at: string
          criado_por: string | null
          data: string
          fechamento_id: string | null
          id: string
          nome: string
          observacoes: string | null
          operador_id: string | null
          operador_nome: string | null
          situacao: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          data?: string
          fechamento_id?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          operador_id?: string | null
          operador_nome?: string | null
          situacao?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          data?: string
          fechamento_id?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          operador_id?: string | null
          operador_nome?: string | null
          situacao?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "caixas_fechamento_id_fkey"
            columns: ["fechamento_id"]
            isOneToOne: false
            referencedRelation: "fechamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      caixas_exclusoes: {
        Row: {
          caixa_id: string | null
          created_at: string
          data: string | null
          excluido_por: string | null
          excluido_por_nome: string | null
          id: string
          motivo: string
          nome: string | null
          operador_id: string | null
          operador_nome: string | null
          situacao: string | null
        }
        Insert: {
          caixa_id?: string | null
          created_at?: string
          data?: string | null
          excluido_por?: string | null
          excluido_por_nome?: string | null
          id?: string
          motivo: string
          nome?: string | null
          operador_id?: string | null
          operador_nome?: string | null
          situacao?: string | null
        }
        Update: {
          caixa_id?: string | null
          created_at?: string
          data?: string | null
          excluido_por?: string | null
          excluido_por_nome?: string | null
          id?: string
          motivo?: string
          nome?: string | null
          operador_id?: string | null
          operador_nome?: string | null
          situacao?: string | null
        }
        Relationships: []
      }
      contas_loterica: {
        Row: {
          conta: Database["public"]["Enums"]["conta_loterica"]
          created_at: string
          criado_por: string | null
          data: string
          id: string
          observacoes: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          conta: Database["public"]["Enums"]["conta_loterica"]
          created_at?: string
          criado_por?: string | null
          data?: string
          id?: string
          observacoes?: string | null
          updated_at?: string
          valor?: number
        }
        Update: {
          conta?: Database["public"]["Enums"]["conta_loterica"]
          created_at?: string
          criado_por?: string | null
          data?: string
          id?: string
          observacoes?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      estoque_boloes: {
        Row: {
          concurso: string
          cotas: number
          created_at: string
          criado_por: string | null
          data: string
          id: string
          modelo_id: string | null
          nome: string
          observacoes: string | null
          situacao: string
          taxa: number
          updated_at: string
          valor_cota: number
        }
        Insert: {
          concurso?: string
          cotas?: number
          created_at?: string
          criado_por?: string | null
          data?: string
          id?: string
          modelo_id?: string | null
          nome: string
          observacoes?: string | null
          situacao?: string
          taxa?: number
          updated_at?: string
          valor_cota?: number
        }
        Update: {
          concurso?: string
          cotas?: number
          created_at?: string
          criado_por?: string | null
          data?: string
          id?: string
          modelo_id?: string | null
          nome?: string
          observacoes?: string | null
          situacao?: string
          taxa?: number
          updated_at?: string
          valor_cota?: number
        }
        Relationships: [
          {
            foreignKeyName: "estoque_boloes_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "boloes_estoque"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_boloes_vendas: {
        Row: {
          canal: Database["public"]["Enums"]["canal_venda"]
          created_at: string
          data: string
          estoque_id: string
          id: string
          observacoes: string | null
          operador_id: string | null
          operador_nome: string | null
          quantidade: number
          updated_at: string
        }
        Insert: {
          canal?: Database["public"]["Enums"]["canal_venda"]
          created_at?: string
          data?: string
          estoque_id: string
          id?: string
          observacoes?: string | null
          operador_id?: string | null
          operador_nome?: string | null
          quantidade?: number
          updated_at?: string
        }
        Update: {
          canal?: Database["public"]["Enums"]["canal_venda"]
          created_at?: string
          data?: string
          estoque_id?: string
          id?: string
          observacoes?: string | null
          operador_id?: string | null
          operador_nome?: string | null
          quantidade?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_boloes_vendas_estoque_id_fkey"
            columns: ["estoque_id"]
            isOneToOne: false
            referencedRelation: "estoque_boloes"
            referencedColumns: ["id"]
          },
        ]
      }
      fechamentos: {
        Row: {
          created_at: string
          dados: Json
          data: string
          diferenca: number
          email_enviado: boolean
          funcionario: string | null
          id: string
          pdf_url: string | null
          relatorio: number
          total: number
          total_bolao_quant: number
          total_bolao_taxa: number
          total_bolao_valor: number
          total_final: number
          total_inicial: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          dados?: Json
          data: string
          diferenca?: number
          email_enviado?: boolean
          funcionario?: string | null
          id?: string
          pdf_url?: string | null
          relatorio?: number
          total?: number
          total_bolao_quant?: number
          total_bolao_taxa?: number
          total_bolao_valor?: number
          total_final?: number
          total_inicial?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          dados?: Json
          data?: string
          diferenca?: number
          email_enviado?: boolean
          funcionario?: string | null
          id?: string
          pdf_url?: string | null
          relatorio?: number
          total?: number
          total_bolao_quant?: number
          total_bolao_taxa?: number
          total_bolao_valor?: number
          total_final?: number
          total_inicial?: number
          user_id?: string | null
        }
        Relationships: []
      }
      lancamentos_simples: {
        Row: {
          caixa_numero: string | null
          campo: string | null
          created_at: string
          data: string
          descricao: string | null
          id: string
          operador_id: string
          operador_nome: string | null
          quantidade: number
          taxa: number
          tipo: Database["public"]["Enums"]["tipo_lancamento_simples"]
          updated_at: string
          valor: number
        }
        Insert: {
          caixa_numero?: string | null
          campo?: string | null
          created_at?: string
          data: string
          descricao?: string | null
          id?: string
          operador_id?: string
          operador_nome?: string | null
          quantidade?: number
          taxa?: number
          tipo: Database["public"]["Enums"]["tipo_lancamento_simples"]
          updated_at?: string
          valor?: number
        }
        Update: {
          caixa_numero?: string | null
          campo?: string | null
          created_at?: string
          data?: string
          descricao?: string | null
          id?: string
          operador_id?: string
          operador_nome?: string | null
          quantidade?: number
          taxa?: number
          tipo?: Database["public"]["Enums"]["tipo_lancamento_simples"]
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nome: string | null
          operador_id: string | null
          ativo: boolean | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          nome?: string | null
          operador_id?: string | null
          ativo?: boolean | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nome?: string | null
          operador_id?: string | null
          ativo?: boolean | null
        }
        Relationships: []
      }
      transferencias_contas: {
        Row: {
          conta_destino: Database["public"]["Enums"]["conta_loterica"]
          conta_origem: Database["public"]["Enums"]["conta_loterica"]
          created_at: string
          criado_por: string | null
          data: string
          id: string
          observacoes: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          conta_destino: Database["public"]["Enums"]["conta_loterica"]
          conta_origem: Database["public"]["Enums"]["conta_loterica"]
          created_at?: string
          criado_por?: string | null
          data?: string
          id?: string
          observacoes?: string | null
          updated_at?: string
          valor?: number
        }
        Update: {
          conta_destino?: Database["public"]["Enums"]["conta_loterica"]
          conta_origem?: Database["public"]["Enums"]["conta_loterica"]
          created_at?: string
          criado_por?: string | null
          data?: string
          id?: string
          observacoes?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      clientes: {
        Row: { id: string; created_at: string; nome: string; nome_lower: string; telefone: string | null; observacao: string | null; created_by: string | null }
        Insert: { id?: string; created_at?: string; nome: string; telefone?: string | null; observacao?: string | null; created_by?: string | null }
        Update: { id?: string; created_at?: string; nome?: string; telefone?: string | null; observacao?: string | null; created_by?: string | null }
        Relationships: []
      }
      fiados: {
        Row: { id: string; created_at: string; cliente_id: string; valor: number; descricao: string; observacao: string | null; data_inicio: string; data_vencimento: string; status: "pendente" | "aguardando_aprovacao" | "pago" | "vencido"; lancado_por: string; baixa_em: string | null; baixa_por: string | null }
        Insert: { id?: string; created_at?: string; cliente_id: string; valor: number; descricao: string; observacao?: string | null; data_inicio?: string; data_vencimento: string; status?: "pendente" | "aguardando_aprovacao" | "pago" | "vencido"; lancado_por: string; baixa_em?: string | null; baixa_por?: string | null }
        Update: { id?: string; created_at?: string; cliente_id?: string; valor?: number; descricao?: string; observacao?: string | null; data_inicio?: string; data_vencimento?: string; status?: "pendente" | "aguardando_aprovacao" | "pago" | "vencido"; lancado_por?: string; baixa_em?: string | null; baixa_por?: string | null }
        Relationships: []
      }
      baixas_solicitacoes: {
        Row: { id: string; created_at: string; fiado_id: string; solicitado_por: string; observacao: string | null; status: "pendente" | "aprovada" | "rejeitada"; decidido_por: string | null; decidido_em: string | null; motivo_rejeicao: string | null; valor_pago: number | null }
        Insert: { id?: string; created_at?: string; fiado_id: string; solicitado_por: string; observacao?: string | null; status?: "pendente" | "aprovada" | "rejeitada"; decidido_por?: string | null; decidido_em?: string | null; motivo_rejeicao?: string | null; valor_pago?: number | null }
        Update: { id?: string; created_at?: string; fiado_id?: string; solicitado_por?: string; observacao?: string | null; status?: "pendente" | "aprovada" | "rejeitada"; decidido_por?: string | null; decidido_em?: string | null; motivo_rejeicao?: string | null; valor_pago?: number | null }
        Relationships: []
      }
      creditos: {
        Row: { id: string; created_at: string; updated_at: string; cliente_id: string; valor: number; descricao: string; observacao: string | null; data_credito: string; lancado_por: string | null; fiado_id: string | null }
        Insert: { id?: string; created_at?: string; updated_at?: string; cliente_id: string; valor: number; descricao?: string; observacao?: string | null; data_credito?: string; lancado_por?: string | null; fiado_id?: string | null }
        Update: { id?: string; created_at?: string; updated_at?: string; cliente_id?: string; valor?: number; descricao?: string; observacao?: string | null; data_credito?: string; lancado_por?: string | null; fiado_id?: string | null }
        Relationships: []
      }
      notificacoes: {
        Row: { id: string; created_at: string; user_id: string; tipo: "novo_fiado" | "solicitacao_baixa" | "baixa_aprovada" | "baixa_rejeitada" | "fiado_vencido"; titulo: string; mensagem: string; link: string | null; lida: boolean }
        Insert: { id?: string; created_at?: string; user_id: string; tipo: "novo_fiado" | "solicitacao_baixa" | "baixa_aprovada" | "baixa_rejeitada" | "fiado_vencido"; titulo: string; mensagem: string; link?: string | null; lida?: boolean }
        Update: { id?: string; created_at?: string; user_id?: string; tipo?: "novo_fiado" | "solicitacao_baixa" | "baixa_aprovada" | "baixa_rejeitada" | "fiado_vencido"; titulo?: string; mensagem?: string; link?: string | null; lida?: boolean }
        Relationships: []
      }
      activity_logs: {
        Row: { id: string; created_at: string; user_id: string | null; user_nome: string | null; acao: string; detalhes: any | null }
        Insert: { id?: string; created_at?: string; user_id?: string | null; user_nome?: string | null; acao: string; detalhes?: any | null }
        Update: { id?: string; created_at?: string; user_id?: string | null; user_nome?: string | null; acao?: string; detalhes?: any | null }
        Relationships: []
      }
      operadores: {
        Row: { id: string; nome: string; ativo: boolean; created_at: string }
        Insert: { id?: string; nome: string; ativo?: boolean; created_at?: string }
        Update: { id?: string; nome?: string; ativo?: boolean; created_at?: string }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _user_id: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "operador"
      canal_venda: "LOJA" | "MARKETPLACE"
      conta_loterica:
        | "CONTA 043"
        | "CONTA 003"
        | "CONTA RETAGUARDA"
        | "CONTA COMISSÃO"
        | "CONTA FIADO"
        | "CONTA MOEDAS"
        | "CONTA CARTÃO"
        | "CONTA PREMIO RASP"
        | "CONTA RESGATE TELESENA"
        | "CONTA CARRO FORTE"
      tipo_lancamento_simples: "GAVETA" | "CAIXA" | "BOLAO" | "RELATORIO"
      fiado_status: "pendente" | "aguardando_aprovacao" | "pago" | "vencido"
      solicitacao_status: "pendente" | "aprovada" | "rejeitada"
      notif_tipo: "novo_fiado" | "solicitacao_baixa" | "baixa_aprovada" | "baixa_rejeitada" | "fiado_vencido"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "operador"],
      canal_venda: ["LOJA", "MARKETPLACE"],
      conta_loterica: [
        "CONTA 043",
        "CONTA 003",
        "CONTA RETAGUARDA",
        "CONTA COMISSÃO",
        "CONTA FIADO",
        "CONTA MOEDAS",
        "CONTA CARTÃO",
        "CONTA PREMIO RASP",
        "CONTA RESGATE TELESENA",
        "CONTA CARRO FORTE",
      ],
      tipo_lancamento_simples: ["GAVETA", "CAIXA", "BOLAO", "RELATORIO"],
      fiado_status: ["pendente", "aguardando_aprovacao", "pago", "vencido"],
      solicitacao_status: ["pendente", "aprovada", "rejeitada"],
      notif_tipo: ["novo_fiado", "solicitacao_baixa", "baixa_aprovada", "baixa_rejeitada", "fiado_vencido"],
    },
  },
} as const

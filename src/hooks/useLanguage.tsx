import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export type LangCode = "fr" | "en" | "pt" | "de" | "es" | "it" | "ar" | "zh" | "ja" | "hi" | "pl" | "ru";

const translations: Record<string, Record<LangCode, string>> = {
  // Navigation
  "nav.dashboard": { fr: "Tableau de bord", en: "Dashboard", pt: "Painel", de: "Dashboard", es: "Panel", it: "Pannello", ar: "لوحة القيادة", zh: "仪表板", ja: "ダッシュボード", hi: "डैशबोर्ड", pl: "Panel", ru: "Панель" },
  "nav.serviceOrders": { fr: "Ordres de service", en: "Service Orders", pt: "Ordens de serviço", de: "Serviceaufträge", es: "Órdenes de servicio", it: "Ordini di servizio", ar: "أوامر الخدمة", zh: "服务订单", ja: "サービスオーダー", hi: "सेवा आदेश", pl: "Zlecenia serwisowe", ru: "Заказ-наряды" },
  "nav.paymentOrders": { fr: "Ordres de paiement", en: "Payment Orders", pt: "Ordens de pagamento", de: "Zahlungsaufträge", es: "Órdenes de pago", it: "Ordini di pagamento", ar: "أوامر الدفع", zh: "付款订单", ja: "支払い注文", hi: "भुगतान आदेश", pl: "Zlecenia płatności", ru: "Платёжные поручения" },
  "nav.financial": { fr: "Finance", en: "Financial", pt: "Financeiro", de: "Finanzen", es: "Finanzas", it: "Finanze", ar: "المالية", zh: "财务", ja: "財務", hi: "वित्तीय", pl: "Finanse", ru: "Финансы" },
  "nav.profit": { fr: "Distribution des profits", en: "Profit Distribution", pt: "Distribuição de lucros", de: "Gewinnverteilung", es: "Distribución de ganancias", it: "Distribuzione profitti", ar: "توزيع الأرباح", zh: "利润分配", ja: "利益配分", hi: "लाभ वितरण", pl: "Podział zysków", ru: "Распределение прибыли" },
  "nav.accounting": { fr: "Comptabilité", en: "Accounting", pt: "Contabilidade", de: "Buchhaltung", es: "Contabilidad", it: "Contabilità", ar: "المحاسبة", zh: "会计", ja: "会計", hi: "लेखांकन", pl: "Księgowość", ru: "Бухгалтерия" },
  "nav.fleet": { fr: "Flotte", en: "Fleet", pt: "Frota", de: "Fuhrpark", es: "Flota", it: "Flotta", ar: "الأسطول", zh: "车队", ja: "フリート", hi: "बेड़ा", pl: "Flota", ru: "Автопарк" },
  "nav.documents": { fr: "Documents", en: "Documents", pt: "Documentos", de: "Dokumente", es: "Documentos", it: "Documenti", ar: "المستندات", zh: "文档", ja: "ドキュメント", hi: "दस्तावेज़", pl: "Dokumenty", ru: "Документы" },
  "nav.users": { fr: "Utilisateurs", en: "Users", pt: "Usuários", de: "Benutzer", es: "Usuarios", it: "Utenti", ar: "المستخدمون", zh: "用户", ja: "ユーザー", hi: "उपयोगकर्ता", pl: "Użytkownicy", ru: "Пользователи" },
  "nav.settings": { fr: "Paramètres", en: "Settings", pt: "Configurações", de: "Einstellungen", es: "Configuración", it: "Impostazioni", ar: "الإعدادات", zh: "设置", ja: "設定", hi: "सेटिंग्स", pl: "Ustawienia", ru: "Настройки" },
  "nav.operations": { fr: "Opérations", en: "Operations", pt: "Operações", de: "Betrieb", es: "Operaciones", it: "Operazioni", ar: "العمليات", zh: "运营", ja: "オペレーション", hi: "संचालन", pl: "Operacje", ru: "Операции" },

  // Dashboard
  "dashboard.title": { fr: "Tableau de bord", en: "Dashboard", pt: "Painel", de: "Dashboard", es: "Panel", it: "Pannello", ar: "لوحة القيادة", zh: "仪表板", ja: "ダッシュボード", hi: "डैशबोर्ड", pl: "Panel", ru: "Панель" },
  "dashboard.subtitle": { fr: "Vue d'ensemble de vos opérations", en: "Overview of your operations", pt: "Visão geral das suas operações", de: "Überblick über Ihre Abläufe", es: "Resumen de sus operaciones", it: "Panoramica delle operazioni", ar: "نظرة عامة على عملياتك", zh: "运营概览", ja: "運用概要", hi: "आपके संचालन का अवलोकन", pl: "Przegląd operacji", ru: "Обзор операций" },
  "dashboard.revenue": { fr: "Chiffre d'affaires", en: "Revenue", pt: "Receita", de: "Umsatz", es: "Ingresos", it: "Ricavi", ar: "الإيرادات", zh: "收入", ja: "収益", hi: "राजस्व", pl: "Przychody", ru: "Выручка" },
  "dashboard.pendingPayments": { fr: "Paiements en attente", en: "Pending Payments", pt: "Pagamentos pendentes", de: "Ausstehende Zahlungen", es: "Pagos pendientes", it: "Pagamenti in sospeso", ar: "المدفوعات المعلقة", zh: "待付款", ja: "保留中の支払い", hi: "लंबित भुगतान", pl: "Oczekujące płatności", ru: "Ожидающие платежи" },
  "dashboard.completedServices": { fr: "Services terminés", en: "Completed Services", pt: "Serviços concluídos", de: "Abgeschlossene Dienste", es: "Servicios completados", it: "Servizi completati", ar: "الخدمات المكتملة", zh: "已完成服务", ja: "完了サービス", hi: "पूर्ण सेवाएँ", pl: "Ukończone usługi", ru: "Завершённые услуги" },
  "dashboard.performance": { fr: "Performance", en: "Performance", pt: "Desempenho", de: "Leistung", es: "Rendimiento", it: "Prestazioni", ar: "الأداء", zh: "性能", ja: "パフォーマンス", hi: "प्रदर्शन", pl: "Wydajność", ru: "Производительность" },
  "dashboard.vsLastMonth": { fr: "vs mois dernier", en: "vs last month", pt: "vs mês passado", de: "vs letzten Monat", es: "vs mes pasado", it: "vs mese scorso", ar: "مقابل الشهر الماضي", zh: "与上月相比", ja: "先月比", hi: "पिछले महीने बनाम", pl: "vs ostatni miesiąc", ru: "по сравнению с прошлым месяцем" },
  "dashboard.revenueOverview": { fr: "Aperçu des revenus", en: "Revenue Overview", pt: "Visão geral da receita", de: "Umsatzübersicht", es: "Resumen de ingresos", it: "Panoramica ricavi", ar: "نظرة عامة على الإيرادات", zh: "收入概览", ja: "収益概要", hi: "राजस्व अवलोकन", pl: "Przegląd przychodów", ru: "Обзор выручки" },
  "dashboard.monthlyRevExp": { fr: "Revenus vs dépenses mensuels", en: "Monthly revenue vs expenses", pt: "Receitas vs despesas mensais", de: "Monatlicher Umsatz vs Ausgaben", es: "Ingresos vs gastos mensuales", it: "Ricavi vs spese mensili", ar: "الإيرادات مقابل المصاريف الشهرية", zh: "月度收入与支出", ja: "月間収益vs支出", hi: "मासिक राजस्व बनाम व्यय", pl: "Przychody vs wydatki miesięcznie", ru: "Ежемесячная выручка vs расходы" },

  // Common actions
  "action.save": { fr: "Enregistrer", en: "Save", pt: "Salvar", de: "Speichern", es: "Guardar", it: "Salva", ar: "حفظ", zh: "保存", ja: "保存", hi: "सहेजें", pl: "Zapisz", ru: "Сохранить" },
  "action.delete": { fr: "Supprimer", en: "Delete", pt: "Excluir", de: "Löschen", es: "Eliminar", it: "Elimina", ar: "حذف", zh: "删除", ja: "削除", hi: "हटाएँ", pl: "Usuń", ru: "Удалить" },
  "action.edit": { fr: "Modifier", en: "Edit", pt: "Editar", de: "Bearbeiten", es: "Editar", it: "Modifica", ar: "تعديل", zh: "编辑", ja: "編集", hi: "संपादित करें", pl: "Edytuj", ru: "Редактировать" },
  "action.add": { fr: "Ajouter", en: "Add", pt: "Adicionar", de: "Hinzufügen", es: "Añadir", it: "Aggiungi", ar: "إضافة", zh: "添加", ja: "追加", hi: "जोड़ें", pl: "Dodaj", ru: "Добавить" },
  "action.cancel": { fr: "Annuler", en: "Cancel", pt: "Cancelar", de: "Abbrechen", es: "Cancelar", it: "Annulla", ar: "إلغاء", zh: "取消", ja: "キャンセル", hi: "रद्द करें", pl: "Anuluj", ru: "Отмена" },
  "action.confirm": { fr: "Confirmer", en: "Confirm", pt: "Confirmar", de: "Bestätigen", es: "Confirmar", it: "Conferma", ar: "تأكيد", zh: "确认", ja: "確認", hi: "पुष्टि करें", pl: "Potwierdź", ru: "Подтвердить" },
  "action.search": { fr: "Rechercher...", en: "Search...", pt: "Pesquisar...", de: "Suchen...", es: "Buscar...", it: "Cerca...", ar: "بحث...", zh: "搜索...", ja: "検索...", hi: "खोजें...", pl: "Szukaj...", ru: "Поиск..." },
  "action.upload": { fr: "Télécharger", en: "Upload", pt: "Enviar", de: "Hochladen", es: "Subir", it: "Carica", ar: "تحميل", zh: "上传", ja: "アップロード", hi: "अपलोड", pl: "Prześlij", ru: "Загрузить" },
  "action.discard": { fr: "Annuler", en: "Discard", pt: "Descartar", de: "Verwerfen", es: "Descartar", it: "Scarta", ar: "تجاهل", zh: "丢弃", ja: "破棄", hi: "त्यागें", pl: "Odrzuć", ru: "Отменить" },
  "action.refresh": { fr: "Actualiser", en: "Refresh", pt: "Atualizar", de: "Aktualisieren", es: "Actualizar", it: "Aggiorna", ar: "تحديث", zh: "刷新", ja: "更新", hi: "रिफ्रेश", pl: "Odśwież", ru: "Обновить" },
  "action.signOut": { fr: "Déconnexion", en: "Sign Out", pt: "Sair", de: "Abmelden", es: "Cerrar sesión", it: "Esci", ar: "تسجيل الخروج", zh: "登出", ja: "ログアウト", hi: "साइन आउट", pl: "Wyloguj", ru: "Выйти" },

  // Common labels
  "label.client": { fr: "Client", en: "Client", pt: "Cliente", de: "Kunde", es: "Cliente", it: "Cliente", ar: "العميل", zh: "客户", ja: "クライアント", hi: "ग्राहक", pl: "Klient", ru: "Клиент" },
  "label.platform": { fr: "Plateforme", en: "Platform", pt: "Plataforma", de: "Plattform", es: "Plataforma", it: "Piattaforma", ar: "المنصة", zh: "平台", ja: "プラットフォーム", hi: "प्लेटफ़ॉर्म", pl: "Platforma", ru: "Платформа" },
  "label.technician": { fr: "Technicien", en: "Technician", pt: "Técnico", de: "Techniker", es: "Técnico", it: "Tecnico", ar: "فني", zh: "技术员", ja: "技術者", hi: "तकनीशियन", pl: "Technik", ru: "Техник" },
  "label.status": { fr: "Statut", en: "Status", pt: "Status", de: "Status", es: "Estado", it: "Stato", ar: "الحالة", zh: "状态", ja: "ステータス", hi: "स्थिति", pl: "Status", ru: "Статус" },
  "label.total": { fr: "Total", en: "Total", pt: "Total", de: "Gesamt", es: "Total", it: "Totale", ar: "المجموع", zh: "总计", ja: "合計", hi: "कुल", pl: "Łącznie", ru: "Итого" },
  "label.date": { fr: "Date", en: "Date", pt: "Data", de: "Datum", es: "Fecha", it: "Data", ar: "التاريخ", zh: "日期", ja: "日付", hi: "दिनांक", pl: "Data", ru: "Дата" },
  "label.name": { fr: "Nom", en: "Name", pt: "Nome", de: "Name", es: "Nombre", it: "Nome", ar: "الاسم", zh: "名称", ja: "名前", hi: "नाम", pl: "Nazwa", ru: "Имя" },
  "label.email": { fr: "E-mail", en: "Email", pt: "E-mail", de: "E-Mail", es: "Correo", it: "Email", ar: "البريد الإلكتروني", zh: "电子邮件", ja: "メール", hi: "ईमेल", pl: "E-mail", ru: "Эл. почта" },
  "label.role": { fr: "Rôle", en: "Role", pt: "Função", de: "Rolle", es: "Rol", it: "Ruolo", ar: "الدور", zh: "角色", ja: "役割", hi: "भूमिका", pl: "Rola", ru: "Роль" },
  "label.amount": { fr: "Montant", en: "Amount", pt: "Valor", de: "Betrag", es: "Importe", it: "Importo", ar: "المبلغ", zh: "金额", ja: "金額", hi: "राशि", pl: "Kwota", ru: "Сумма" },
  "label.type": { fr: "Type", en: "Type", pt: "Tipo", de: "Typ", es: "Tipo", it: "Tipo", ar: "النوع", zh: "类型", ja: "タイプ", hi: "प्रकार", pl: "Typ", ru: "Тип" },
  "label.notes": { fr: "Notes", en: "Notes", pt: "Notas", de: "Notizen", es: "Notas", it: "Note", ar: "ملاحظات", zh: "备注", ja: "メモ", hi: "नोट्स", pl: "Notatki", ru: "Заметки" },
  "label.category": { fr: "Catégorie", en: "Category", pt: "Categoria", de: "Kategorie", es: "Categoría", it: "Categoria", ar: "الفئة", zh: "分类", ja: "カテゴリ", hi: "श्रेणी", pl: "Kategoria", ru: "Категория" },
  "label.week": { fr: "Semaine", en: "Week", pt: "Semana", de: "Woche", es: "Semana", it: "Settimana", ar: "الأسبوع", zh: "周", ja: "週", hi: "सप्ताह", pl: "Tydzień", ru: "Неделя" },
  "label.car": { fr: "Véhicule", en: "Car", pt: "Carro", de: "Fahrzeug", es: "Vehículo", it: "Veicolo", ar: "السيارة", zh: "车辆", ja: "車両", hi: "वाहन", pl: "Pojazd", ru: "Автомобиль" },
  "label.plate": { fr: "Plaque", en: "Plate", pt: "Placa", de: "Kennzeichen", es: "Matrícula", it: "Targa", ar: "اللوحة", zh: "车牌", ja: "ナンバー", hi: "प्लेट", pl: "Tablica", ru: "Номер" },
  "label.services": { fr: "Services", en: "Services", pt: "Serviços", de: "Dienste", es: "Servicios", it: "Servizi", ar: "الخدمات", zh: "服务", ja: "サービス", hi: "सेवाएँ", pl: "Usługi", ru: "Услуги" },
  "label.list": { fr: "Liste", en: "List", pt: "Lista", de: "Liste", es: "Lista", it: "Lista", ar: "القائمة", zh: "列表", ja: "リスト", hi: "सूची", pl: "Lista", ru: "Список" },
  "label.actions": { fr: "Actions", en: "Actions", pt: "Ações", de: "Aktionen", es: "Acciones", it: "Azioni", ar: "الإجراءات", zh: "操作", ja: "アクション", hi: "क्रियाएँ", pl: "Akcje", ru: "Действия" },
  "label.allClients": { fr: "Tous les clients", en: "All clients", pt: "Todos os clientes", de: "Alle Kunden", es: "Todos los clientes", it: "Tutti i clienti", ar: "جميع العملاء", zh: "所有客户", ja: "全クライアント", hi: "सभी ग्राहक", pl: "Wszyscy klienci", ru: "Все клиенты" },
  "label.allPlatforms": { fr: "Toutes les plateformes", en: "All platforms", pt: "Todas as plataformas", de: "Alle Plattformen", es: "Todas las plataformas", it: "Tutte le piattaforme", ar: "جميع المنصات", zh: "所有平台", ja: "全プラットフォーム", hi: "सभी प्लेटफ़ॉर्म", pl: "Wszystkie platformy", ru: "Все платформы" },
  "label.allTechnicians": { fr: "Tous les techniciens", en: "All technicians", pt: "Todos os técnicos", de: "Alle Techniker", es: "Todos los técnicos", it: "Tutti i tecnici", ar: "جميع الفنيين", zh: "所有技术员", ja: "全技術者", hi: "सभी तकनीशियन", pl: "Wszyscy technicy", ru: "Все техники" },
  "label.allWeeks": { fr: "Toutes les semaines", en: "All weeks", pt: "Todas as semanas", de: "Alle Wochen", es: "Todas las semanas", it: "Tutte le settimane", ar: "جميع الأسابيع", zh: "所有周", ja: "全週", hi: "सभी सप्ताह", pl: "Wszystkie tygodnie", ru: "Все недели" },
  "label.allLists": { fr: "Toutes les listes", en: "All lists", pt: "Todas as listas", de: "Alle Listen", es: "Todas las listas", it: "Tutte le liste", ar: "جميع القوائم", zh: "所有列表", ja: "全リスト", hi: "सभी सूचियाँ", pl: "Wszystkie listy", ru: "Все listy" },

  // Settings
  "settings.title": { fr: "Paramètres", en: "Settings", pt: "Configurações", de: "Einstellungen", es: "Configuración", it: "Impostazioni", ar: "الإعدادات", zh: "设置", ja: "設定", hi: "सेटिंग्स", pl: "Ustawienia", ru: "Настройки" },
  "settings.subtitle": { fr: "Configuration du système et du profil", en: "System and profile configuration", pt: "Configuração do sistema e perfil", de: "System- und Profilkonfiguration", es: "Configuración del sistema y perfil", it: "Configurazione sistema e profilo", ar: "إعدادات النظام والملف الشخصي", zh: "系统和个人资料配置", ja: "システムとプロフィール設定", hi: "सिस्टम और प्रोफ़ाइल कॉन्फ़िगरेशन", pl: "Konfiguracja systemu i profilu", ru: "Настройки системы и профиля" },
  "settings.company": { fr: "Informations de l'entreprise", en: "Company Information", pt: "Informações da empresa", de: "Firmeninformationen", es: "Información de la empresa", it: "Informazioni aziendali", ar: "معلومات الشركة", zh: "公司信息", ja: "会社情報", hi: "कंपनी की जानकारी", pl: "Informacje o firmie", ru: "Информация о компании" },
  "settings.profile": { fr: "Profil", en: "Profile", pt: "Perfil", de: "Profil", es: "Perfil", it: "Profilo", ar: "الملف الشخصي", zh: "个人资料", ja: "プロフィール", hi: "प्रोफ़ाइल", pl: "Profil", ru: "Профиль" },
  "settings.companyName": { fr: "Nom de l'entreprise", en: "Company Name", pt: "Nome da empresa", de: "Firmenname", es: "Nombre de la empresa", it: "Nome azienda", ar: "اسم الشركة", zh: "公司名称", ja: "会社名", hi: "कंपनी का नाम", pl: "Nazwa firmy", ru: "Название компании" },
  "settings.siret": { fr: "SIRET", en: "SIRET", pt: "SIRET", de: "SIRET", es: "SIRET", it: "SIRET", ar: "SIRET", zh: "SIRET", ja: "SIRET", hi: "SIRET", pl: "SIRET", ru: "SIRET" },
  "settings.tva": { fr: "Numéro TVA", en: "VAT Number", pt: "Número IVA", de: "USt-IdNr.", es: "Número IVA", it: "Partita IVA", ar: "رقم ضريبة القيمة المضافة", zh: "增值税号", ja: "VAT番号", hi: "वैट नंबर", pl: "Numer VAT", ru: "Номер НДС" },
  "settings.address": { fr: "Adresse", en: "Address", pt: "Endereço", de: "Adresse", es: "Dirección", it: "Indirizzo", ar: "العنوان", zh: "地址", ja: "住所", hi: "पता", pl: "Adres", ru: "Адрес" },
  "settings.fullName": { fr: "Nom complet", en: "Full Name", pt: "Nome completo", de: "Vollständiger Name", es: "Nombre completo", it: "Nome completo", ar: "الاسم الكامل", zh: "全名", ja: "フルネーム", hi: "पूरा नाम", pl: "Pełne imię", ru: "Полное имя" },
  "settings.saveProfile": { fr: "Enregistrer le profil", en: "Save Profile", pt: "Salvar perfil", de: "Profil speichern", es: "Guardar perfil", it: "Salva profilo", ar: "حفظ الملف الشخصي", zh: "保存个人资料", ja: "プロフィール保存", hi: "प्रोफ़ाइल सहेजें", pl: "Zapisz profil", ru: "Сохранить профиль" },
  "settings.saveCompany": { fr: "Enregistrer l'entreprise", en: "Save Company", pt: "Salvar empresa", de: "Firma speichern", es: "Guardar empresa", it: "Salva azienda", ar: "حفظ الشركة", zh: "保存公司信息", ja: "会社情報保存", hi: "कंपनी सहेजें", pl: "Zapisz firmę", ru: "Сохранить компанию" },

  // Service Orders
  "so.title": { fr: "Ordres de service", en: "Service Orders", pt: "Ordens de serviço", de: "Serviceaufträge", es: "Órdenes de servicio", it: "Ordini di servizio", ar: "أوامر الخدمة", zh: "服务订单", ja: "サービスオーダー", hi: "सेवा आदेश", pl: "Zlecenia serwisowe", ru: "Заказ-наряды" },
  "so.subtitle": { fr: "Téléchargez des documents pour extraire les données automatiquement", en: "Upload documents to extract service data automatically", pt: "Envie documentos para extrair dados automaticamente", de: "Laden Sie Dokumente hoch, um Daten automatisch zu extrahieren", es: "Suba documentos para extraer datos automáticamente", it: "Carica documenti per estrarre dati automaticamente", ar: "قم بتحميل المستندات لاستخراج البيانات تلقائيًا", zh: "上传文档以自动提取服务数据", ja: "ドキュメントをアップロードしてデータを自動抽出", hi: "दस्तावेज़ अपलोड करें और डेटा स्वचालित रूप से निकालें", pl: "Prześlij dokumenty, aby automatycznie wyodrębnić dane", ru: "Загрузите документы для автоматического извлечения данных" },
  "so.noOrders": { fr: "Aucun ordre de service.", en: "No service orders yet.", pt: "Nenhuma ordem de serviço.", de: "Noch keine Serviceaufträge.", es: "Sin órdenes de servicio.", it: "Nessun ordine di servizio.", ar: "لا توجد أوامر خدمة.", zh: "暂无服务订单。", ja: "サービスオーダーはまだありません。", hi: "कोई सेवा आदेश नहीं।", pl: "Brak zleceń serwisowych.", ru: "Заказ-нарядов пока нет." },
  "so.uploadHint": { fr: "Téléchargez un document ci-dessus pour commencer.", en: "Upload a document above to get started.", pt: "Envie um documento acima para começar.", de: "Laden Sie oben ein Dokument hoch.", es: "Suba un documento arriba para comenzar.", it: "Carica un documento sopra per iniziare.", ar: "قم بتحميل مستند أعلاه للبدء.", zh: "上传文档开始使用。", ja: "上のドキュメントをアップロードして始めましょう。", hi: "शुरू करने के लिए ऊपर दस्तावेज़ अपलोड करें।", pl: "Prześlij dokument powyżej, aby rozpocząć.", ru: "Загрузите документ выше, чтобы начать." },
  "so.confirmDelete": { fr: "Supprimer cet ordre de service ?", en: "Delete this service order?", pt: "Excluir esta ordem de serviço?", de: "Diesen Serviceauftrag löschen?", es: "¿Eliminar esta orden de servicio?", it: "Eliminare questo ordine di servizio?", ar: "حذف أمر الخدمة هذا؟", zh: "删除此服务订单？", ja: "このサービスオーダーを削除しますか？", hi: "इस सेवा आदेश को हटाएँ?", pl: "Usunąć to zlecenie?", ru: "Удалить этот заказ-наряд?" },

  // Payment Orders
  "po.title": { fr: "Ordres de paiement", en: "Payment Orders", pt: "Ordens de pagamento", de: "Zahlungsaufträge", es: "Órdenes de pago", it: "Ordini di pagamento", ar: "أوامر الدفع", zh: "付款订单", ja: "支払い注文", hi: "भुगतान आदेश", pl: "Zlecenia płatności", ru: "Платёжные поручения" },
  "po.subtitle": { fr: "Téléchargez des listes de paiement et détectez les écarts", en: "Upload payment lists and auto-detect discrepancies", pt: "Envie listas de pagamento e detecte discrepâncias", de: "Laden Sie Zahlungslisten hoch und erkennen Sie Abweichungen", es: "Suba listas de pago y detecte discrepancias", it: "Carica liste pagamenti e rileva discrepanze", ar: "قم بتحميل قوائم الدفع واكتشف التناقضات", zh: "上传付款清单并自动检测差异", ja: "支払いリストをアップロードして差異を自動検出", hi: "भुगतान सूचियाँ अपलोड करें और विसंगतियाँ पहचानें", pl: "Prześlij listy płatności i wykryj rozbieżności", ru: "Загрузите платёжные ведомости и выявите расхождения" },
  "po.runDetection": { fr: "Lancer la détection", en: "Run Detection", pt: "Executar detecção", de: "Erkennung starten", es: "Ejecutar detección", it: "Avvia rilevamento", ar: "تشغيل الكشف", zh: "运行检测", ja: "検出実行", hi: "पहचान चलाएँ", pl: "Uruchom wykrywanie", ru: "Запустить обнаружение" },

  // Financial
  "fin.title": { fr: "Intelligence financière", en: "Financial Intelligence", pt: "Inteligência financeira", de: "Finanzintelligenz", es: "Inteligencia financiera", it: "Intelligenza finanziaria", ar: "الذكاء المالي", zh: "财务智能", ja: "財務インテリジェンス", hi: "वित्तीय बुद्धिमत्ता", pl: "Inteligencja finansowa", ru: "Финансовая аналитика" },
  "fin.subtitle": { fr: "Comparaison revenus attendus vs réels", en: "Expected vs Real revenue comparison", pt: "Comparação receita esperada vs real", de: "Erwarteter vs tatsächlicher Umsatzvergleich", es: "Comparación ingresos esperados vs reales", it: "Confronto ricavi attesi vs reali", ar: "مقارنة الإيرادات المتوقعة مقابل الفعلية", zh: "预期收入与实际收入对比", ja: "期待収益vs実績比較", hi: "अपेक्षित बनाम वास्तविक राजस्व तुलना", pl: "Porównanie oczekiwanych vs rzeczywistych przychodów", ru: "Сравнение ожидаемой и фактической выручки" },
  "fin.expectedRevenue": { fr: "Revenus attendus", en: "Expected Revenue", pt: "Receita esperada", de: "Erwarteter Umsatz", es: "Ingresos esperados", it: "Ricavi attesi", ar: "الإيرادات المتوقعة", zh: "预期收入", ja: "期待収益", hi: "अपेक्षित राजस्व", pl: "Oczekiwane przychody", ru: "Ожидаемая выручка" },
  "fin.realRevenue": { fr: "Revenus réels", en: "Real Revenue", pt: "Receita real", de: "Tatsächlicher Umsatz", es: "Ingresos reales", it: "Ricavi reali", ar: "الإيرادات الفعلية", zh: "实际收入", ja: "実績収益", hi: "वास्तविक राजस्व", pl: "Rzeczywiste przychody", ru: "Фактическая выручка" },
  "fin.difference": { fr: "Différence", en: "Difference", pt: "Diferença", de: "Differenz", es: "Diferencia", it: "Differenza", ar: "الفرق", zh: "差额", ja: "差額", hi: "अंतर", pl: "Różnica", ru: "Разница" },
  "fin.discrepancies": { fr: "Écarts", en: "Discrepancies", pt: "Discrepâncias", de: "Abweichungen", es: "Discrepancias", it: "Discrepanze", ar: "التناقضات", zh: "差异", ja: "差異", hi: "विसंगतियाँ", pl: "Rozbieżności", ru: "Расхождения" },
  "fin.refreshAnalysis": { fr: "Actualiser l'analyse", en: "Refresh Analysis", pt: "Atualizar análise", de: "Analyse aktualisieren", es: "Actualizar análisis", it: "Aggiorna analisi", ar: "تحديث التحليل", zh: "刷新分析", ja: "分析を更新", hi: "विश्लेषण रिफ्रेश", pl: "Odśwież analizę", ru: "Обновить анализ" },
  "fin.fromServiceOrders": { fr: "À partir des ordres de service", en: "From service orders", pt: "A partir das ordens de serviço", de: "Aus Serviceaufträgen", es: "De órdenes de servicio", it: "Dagli ordini di servizio", ar: "من أوامر الخدمة", zh: "来自服务订单", ja: "サービスオーダーから", hi: "सेवा आदेशों से", pl: "Ze zleceń serwisowych", ru: "Из заказ-нарядов" },
  "fin.fromPaymentOrders": { fr: "À partir des ordres de paiement", en: "From payment orders", pt: "A partir das ordens de pagamento", de: "Aus Zahlungsaufträgen", es: "De órdenes de pago", it: "Dagli ordini di pagamento", ar: "من أوامر الدفع", zh: "来自付款订单", ja: "支払い注文から", hi: "भुगतान आदेशों से", pl: "Ze zleceń płatności", ru: "Из платёжных поручений" },
  "fin.missingMoney": { fr: "Argent manquant", en: "Missing money", pt: "Dinheiro em falta", de: "Fehlendes Geld", es: "Dinero faltante", it: "Denaro mancante", ar: "أموال مفقودة", zh: "缺少金额", ja: "不足金額", hi: "गायब धन", pl: "Brakujące pieniądze", ru: "Недостающие средства" },
  "fin.overpayment": { fr: "Trop-perçu", en: "Overpayment", pt: "Pagamento em excesso", de: "Überzahlung", es: "Sobrepago", it: "Pagamento in eccesso", ar: "دفع زائد", zh: "超额支付", ja: "過払い", hi: "अधिक भुगतान", pl: "Nadpłata", ru: "Переплата" },
  "fin.balanced": { fr: "Équilibré", en: "Balanced", pt: "Equilibrado", de: "Ausgeglichen", es: "Equilibrado", it: "Bilanciato", ar: "متوازن", zh: "平衡", ja: "均衡", hi: "संतुलित", pl: "Zrównoważone", ru: "Сбалансировано" },
  "fin.missing": { fr: "manquant", en: "missing", pt: "faltando", de: "fehlend", es: "faltante", it: "mancante", ar: "مفقود", zh: "缺失", ja: "不足", hi: "गायब", pl: "brakujące", ru: "отсутствует" },
  "fin.mismatch": { fr: "écart", en: "mismatch", pt: "divergência", de: "Abweichung", es: "discrepancia", it: "discrepanza", ar: "تباين", zh: "不匹配", ja: "不一致", hi: "बेमेल", pl: "rozbieżność", ru: "несовпадение" },
  "fin.ok": { fr: "ok", en: "ok", pt: "ok", de: "ok", es: "ok", it: "ok", ar: "موافق", zh: "正确", ja: "OK", hi: "ठीक", pl: "ok", ru: "ок" },
  "fin.discrepancyDetails": { fr: "Détails des écarts", en: "Discrepancy Details", pt: "Detalhes das discrepâncias", de: "Abweichungsdetails", es: "Detalles de discrepancias", it: "Dettagli discrepanze", ar: "تفاصيل التناقضات", zh: "差异详情", ja: "差異の詳細", hi: "विसंगति विवरण", pl: "Szczegóły rozbieżności", ru: "Детали расхождений" },
  "fin.noDiscrepancies": { fr: "Aucun écart détecté. Tous les paiements correspondent.", en: "No discrepancies detected. All payments are matching.", pt: "Nenhuma discrepância detectada. Todos os pagamentos conferem.", de: "Keine Abweichungen erkannt. Alle Zahlungen stimmen überein.", es: "Sin discrepancias detectadas. Todos los pagos coinciden.", it: "Nessuna discrepanza rilevata. Tutti i pagamenti corrispondono.", ar: "لم يتم اكتشاف تناقضات. جميع المدفوعات متطابقة.", zh: "未检测到差异。所有付款均匹配。", ja: "差異は検出されませんでした。すべての支払いが一致しています。", hi: "कोई विसंगति नहीं पाई गई। सभी भुगतान मेल खाते हैं।", pl: "Brak rozbieżności. Wszystkie płatności się zgadzają.", ru: "Расхождений не обнаружено. Все платежи совпадают." },
  "fin.expected": { fr: "Attendu", en: "Expected", pt: "Esperado", de: "Erwartet", es: "Esperado", it: "Atteso", ar: "متوقع", zh: "预期", ja: "期待", hi: "अपेक्षित", pl: "Oczekiwane", ru: "Ожидаемо" },
  "fin.received": { fr: "Reçu", en: "Received", pt: "Recebido", de: "Erhalten", es: "Recibido", it: "Ricevuto", ar: "مستلم", zh: "已收", ja: "受領", hi: "प्राप्त", pl: "Otrzymane", ru: "Получено" },
  "fin.gap": { fr: "Écart", en: "Gap", pt: "Diferença", de: "Lücke", es: "Brecha", it: "Divario", ar: "فجوة", zh: "差距", ja: "ギャップ", hi: "अंतराल", pl: "Luka", ru: "Разрыв" },
  "fin.resolved": { fr: "Résolu", en: "Resolved", pt: "Resolvido", de: "Gelöst", es: "Resuelto", it: "Risolto", ar: "تم الحل", zh: "已解决", ja: "解決済み", hi: "हल किया गया", pl: "Rozwiązane", ru: "Решено" },
  "fin.open": { fr: "Ouvert", en: "Open", pt: "Aberto", de: "Offen", es: "Abierto", it: "Aperto", ar: "مفتوح", zh: "未解决", ja: "未解決", hi: "खुला", pl: "Otwarte", ru: "Открыто" },
  "fin.failedLoad": { fr: "Échec du chargement des données financières.", en: "Failed to load financial data. Please try refreshing.", pt: "Falha ao carregar dados financeiros.", de: "Finanzdaten konnten nicht geladen werden.", es: "Error al cargar datos financieros.", it: "Impossibile caricare i dati finanziari.", ar: "فشل تحميل البيانات المالية.", zh: "加载财务数据失败。", ja: "財務データの読み込みに失敗しました。", hi: "वित्तीय डेटा लोड करने में विफल।", pl: "Nie udało się załadować danych finansowych.", ru: "Не удалось загрузить финансовые данные." },

  // Accounting
  "acc.title": { fr: "Comptabilité", en: "Accounting", pt: "Contabilidade", de: "Buchhaltung", es: "Contabilidad", it: "Contabilità", ar: "المحاسبة", zh: "会计", ja: "会計", hi: "लेखांकन", pl: "Księgowość", ru: "Бухгалтерия" },
  "acc.subtitle": { fr: "Suivi des revenus et dépenses", en: "Revenue and expense tracking", pt: "Rastreamento de receitas e despesas", de: "Einnahmen- und Ausgabenverfolgung", es: "Seguimiento de ingresos y gastos", it: "Monitoraggio ricavi e spese", ar: "تتبع الإيرادات والمصاريف", zh: "收入和支出跟踪", ja: "収支追跡", hi: "राजस्व और व्यय ट्रैकिंग", pl: "Śledzenie przychodów i wydatków", ru: "Учёт доходов и расходов" },
  "acc.addEntry": { fr: "Ajouter une entrée", en: "Add Entry", pt: "Adicionar entrada", de: "Eintrag hinzufügen", es: "Añadir entrada", it: "Aggiungi voce", ar: "إضافة إدخال", zh: "添加条目", ja: "エントリ追加", hi: "प्रविष्टि जोड़ें", pl: "Dodaj wpis", ru: "Добавить запись" },
  "acc.newEntry": { fr: "Nouvelle entrée comptable", en: "New Accounting Entry", pt: "Nova entrada contábil", de: "Neuer Buchhaltungseintrag", es: "Nueva entrada contable", it: "Nuova voce contabile", ar: "إدخال محاسبي جديد", zh: "新会计条目", ja: "新規会計エントリ", hi: "नई लेखा प्रविष्टि", pl: "Nowy wpis księgowy", ru: "Новая бухгалтерская запись" },
  "acc.expense": { fr: "Dépense", en: "Expense", pt: "Despesa", de: "Ausgabe", es: "Gasto", it: "Spesa", ar: "مصروف", zh: "支出", ja: "経費", hi: "व्यय", pl: "Wydatek", ru: "Расход" },
  "acc.revenue": { fr: "Revenu", en: "Revenue", pt: "Receita", de: "Einnahme", es: "Ingreso", it: "Ricavo", ar: "إيراد", zh: "收入", ja: "収益", hi: "राजस्व", pl: "Przychód", ru: "Доход" },
  "acc.noEntries": { fr: "Aucune entrée comptable.", en: "No accounting entries yet.", pt: "Nenhuma entrada contábil.", de: "Noch keine Buchungseinträge.", es: "Sin entradas contables.", it: "Nessuna voce contabile.", ar: "لا توجد إدخالات محاسبية.", zh: "暂无会计条目。", ja: "会計エントリはまだありません。", hi: "कोई लेखा प्रविष्टि नहीं।", pl: "Brak wpisów księgowych.", ru: "Бухгалтерских записей пока нет." },
  "acc.entryAdded": { fr: "Entrée ajoutée", en: "Entry added", pt: "Entrada adicionada", de: "Eintrag hinzugefügt", es: "Entrada añadida", it: "Voce aggiunta", ar: "تمت إضافة الإدخال", zh: "条目已添加", ja: "エントリ追加済み", hi: "प्रविष्टि जोड़ी गई", pl: "Wpis dodany", ru: "Запись добавлена" },

  // Fleet
  "fleet.title": { fr: "Gestion de flotte", en: "Fleet Management", pt: "Gestão de frota", de: "Fuhrparkverwaltung", es: "Gestión de flota", it: "Gestione flotta", ar: "إدارة الأسطول", zh: "车队管理", ja: "フリート管理", hi: "बेड़ा प्रबंधन", pl: "Zarządzanie flotą", ru: "Управление автопарком" },
  "fleet.subtitle": { fr: "Gérer les véhicules et le kilométrage", en: "Manage vehicles and mileage", pt: "Gerencie veículos e quilometragem", de: "Fahrzeuge und Kilometerstand verwalten", es: "Gestione vehículos y kilometraje", it: "Gestisci veicoli e chilometraggio", ar: "إدارة المركبات والمسافات", zh: "管理车辆和里程", ja: "車両と走行距離を管理", hi: "वाहन और माइलेज प्रबंधित करें", pl: "Zarządzaj pojazdami i przebiegiem", ru: "Управление транспортом и пробегом" },
  "fleet.addVehicle": { fr: "Ajouter un véhicule", en: "Add Vehicle", pt: "Adicionar veículo", de: "Fahrzeug hinzufügen", es: "Añadir vehículo", it: "Aggiungi veicolo", ar: "إضافة مركبة", zh: "添加车辆", ja: "車両追加", hi: "वाहन जोड़ें", pl: "Dodaj pojazd", ru: "Добавить транспорт" },
  "fleet.newVehicle": { fr: "Nouveau véhicule", en: "New Vehicle", pt: "Novo veículo", de: "Neues Fahrzeug", es: "Nuevo vehículo", it: "Nuovo veicolo", ar: "مركبة جديدة", zh: "新车辆", ja: "新規車両", hi: "नया वाहन", pl: "Nowy pojazd", ru: "Новый транспорт" },
  "fleet.noVehicles": { fr: "Aucun véhicule. Ajoutez votre premier véhicule.", en: "No vehicles yet. Add your first vehicle above.", pt: "Nenhum veículo. Adicione o primeiro.", de: "Noch keine Fahrzeuge. Fügen Sie das erste hinzu.", es: "Sin vehículos. Añada el primero.", it: "Nessun veicolo. Aggiungi il primo.", ar: "لا توجد مركبات. أضف أول مركبة.", zh: "暂无车辆。添加第一辆。", ja: "車両がありません。最初の車両を追加してください。", hi: "कोई वाहन नहीं। पहला वाहन जोड़ें।", pl: "Brak pojazdów. Dodaj pierwszy.", ru: "Транспорта пока нет. Добавьте первый." },
  "fleet.vehicleAdded": { fr: "Véhicule ajouté", en: "Vehicle added", pt: "Veículo adicionado", de: "Fahrzeug hinzugefügt", es: "Vehículo añadido", it: "Veicolo aggiunto", ar: "تمت إضافة المركبة", zh: "车辆已添加", ja: "車両追加済み", hi: "वाहन जोड़ा गया", pl: "Pojazd dodany", ru: "Транспорт добавлен" },
  "fleet.brand": { fr: "Marque", en: "Brand", pt: "Marca", de: "Marke", es: "Marca", it: "Marca", ar: "العلامة التجارية", zh: "品牌", ja: "ブランド", hi: "ब्रांड", pl: "Marka", ru: "Марка" },
  "fleet.model": { fr: "Modèle", en: "Model", pt: "Modelo", de: "Modell", es: "Modelo", it: "Modello", ar: "الموديل", zh: "型号", ja: "モデル", hi: "मॉडल", pl: "Model", ru: "Модель" },
  "fleet.year": { fr: "Année", en: "Year", pt: "Ano", de: "Jahr", es: "Año", it: "Anno", ar: "السنة", zh: "年份", ja: "年式", hi: "वर्ष", pl: "Rok", ru: "Год" },
  "fleet.assignedTo": { fr: "Assigné à", en: "Assigned To", pt: "Atribuído a", de: "Zugewiesen an", es: "Asignado a", it: "Assegnato a", ar: "مخصص لـ", zh: "分配给", ja: "担当", hi: "को सौंपा गया", pl: "Przypisany do", ru: "Назначен" },

  // Documents
  "docs.title": { fr: "Documents", en: "Documents", pt: "Documentos", de: "Dokumente", es: "Documentos", it: "Documenti", ar: "المستندات", zh: "文档", ja: "ドキュメント", hi: "दस्तावेज़", pl: "Dokumenty", ru: "Документы" },
  "docs.subtitle": { fr: "Système de gestion de fichiers", en: "File management system", pt: "Sistema de gestão de arquivos", de: "Dateiverwaltungssystem", es: "Sistema de gestión de archivos", it: "Sistema di gestione file", ar: "نظام إدارة الملفات", zh: "文件管理系统", ja: "ファイル管理システム", hi: "फ़ाइल प्रबंधन प्रणाली", pl: "System zarządzania plikami", ru: "Система управления файлами" },
  "docs.newFolder": { fr: "Nouveau dossier", en: "New Folder", pt: "Nova pasta", de: "Neuer Ordner", es: "Nueva carpeta", it: "Nuova cartella", ar: "مجلد جديد", zh: "新建文件夹", ja: "新規フォルダ", hi: "नया फ़ोल्डर", pl: "Nowy folder", ru: "Новая папка" },
  "docs.createFolder": { fr: "Créer un dossier", en: "Create Folder", pt: "Criar pasta", de: "Ordner erstellen", es: "Crear carpeta", it: "Crea cartella", ar: "إنشاء مجلد", zh: "创建文件夹", ja: "フォルダ作成", hi: "फ़ोल्डर बनाएँ", pl: "Utwórz folder", ru: "Создать папку" },
  "docs.emptyFolder": { fr: "Ce dossier est vide.", en: "This folder is empty.", pt: "Esta pasta está vazia.", de: "Dieser Ordner ist leer.", es: "Esta carpeta está vacía.", it: "Questa cartella è vuota.", ar: "هذا المجلد فارغ.", zh: "此文件夹为空。", ja: "このフォルダは空です。", hi: "यह फ़ोल्डर खाली है।", pl: "Ten folder jest pusty.", ru: "Эта папка пуста." },
  "docs.fileUploaded": { fr: "Fichier téléchargé", en: "File uploaded", pt: "Arquivo enviado", de: "Datei hochgeladen", es: "Archivo subido", it: "File caricato", ar: "تم تحميل الملف", zh: "文件已上传", ja: "ファイルアップロード済み", hi: "फ़ाइल अपलोड हो गई", pl: "Plik przesłany", ru: "Файл загружен" },
  "docs.folderCreated": { fr: "Dossier créé", en: "Folder created", pt: "Pasta criada", de: "Ordner erstellt", es: "Carpeta creada", it: "Cartella creata", ar: "تم إنشاء المجلد", zh: "文件夹已创建", ja: "フォルダ作成済み", hi: "फ़ोल्डर बना", pl: "Folder utworzony", ru: "Папка создана" },
  "docs.size": { fr: "Taille", en: "Size", pt: "Tamanho", de: "Größe", es: "Tamaño", it: "Dimensione", ar: "الحجم", zh: "大小", ja: "サイズ", hi: "आकार", pl: "Rozmiar", ru: "Размер" },

  // Users
  "users.title": { fr: "Gestion des utilisateurs", en: "User Management", pt: "Gestão de usuários", de: "Benutzerverwaltung", es: "Gestión de usuarios", it: "Gestione utenti", ar: "إدارة المستخدمين", zh: "用户管理", ja: "ユーザー管理", hi: "उपयोगकर्ता प्रबंधन", pl: "Zarządzanie użytkownikami", ru: "Управление пользователями" },
  "users.subtitle": { fr: "Gérer les membres de l'équipe et les rôles", en: "Manage team members and roles", pt: "Gerencie membros da equipe e funções", de: "Teammitglieder und Rollen verwalten", es: "Gestione miembros del equipo y roles", it: "Gestisci membri del team e ruoli", ar: "إدارة أعضاء الفريق والأدوار", zh: "管理团队成员和角色", ja: "チームメンバーと役割を管理", hi: "टीम सदस्यों और भूमिकाओं का प्रबंधन", pl: "Zarządzaj członkami zespołu i rolami", ru: "Управление участниками и ролями" },
  "users.noUsers": { fr: "Aucun utilisateur trouvé.", en: "No users found.", pt: "Nenhum usuário encontrado.", de: "Keine Benutzer gefunden.", es: "No se encontraron usuarios.", it: "Nessun utente trovato.", ar: "لم يتم العثور على مستخدمين.", zh: "未找到用户。", ja: "ユーザーが見つかりません。", hi: "कोई उपयोगकर्ता नहीं मिला।", pl: "Nie znaleziono użytkowników.", ru: "Пользователи не найдены." },
  "users.noRole": { fr: "aucun rôle", en: "no role", pt: "sem função", de: "keine Rolle", es: "sin rol", it: "nessun ruolo", ar: "بدون دور", zh: "无角色", ja: "役割なし", hi: "कोई भूमिका नहीं", pl: "brak roli", ru: "без роли" },
  "users.joined": { fr: "Inscrit le", en: "Joined", pt: "Entrou em", de: "Beigetreten", es: "Registrado", it: "Iscritto", ar: "انضم في", zh: "加入时间", ja: "参加日", hi: "शामिल हुए", pl: "Dołączył", ru: "Присоединился" },

  // Profit
  "profit.title": { fr: "Distribution des profits", en: "Profit Distribution", pt: "Distribuição de lucros", de: "Gewinnverteilung", es: "Distribución de ganancias", it: "Distribuzione profitti", ar: "توزيع الأرباح", zh: "利润分配", ja: "利益配分", hi: "लाभ वितरण", pl: "Podział zysków", ru: "Распределение прибыли" },
  "profit.subtitle": { fr: "Configurer les pourcentages de partage des revenus", en: "Configure revenue sharing percentages", pt: "Configurar percentuais de compartilhamento de receita", de: "Umsatzbeteiligungsprozente konfigurieren", es: "Configurar porcentajes de reparto de ingresos", it: "Configura percentuali di condivisione ricavi", ar: "تكوين نسب مشاركة الإيرادات", zh: "配置收入分成比例", ja: "収益分配率を設定", hi: "राजस्व साझा प्रतिशत कॉन्फ़िगर करें", pl: "Skonfiguruj procenty podziału przychodów", ru: "Настройка процентов распределения выручки" },
  "profit.settings": { fr: "Paramètres de distribution", en: "Distribution Settings", pt: "Configurações de distribuição", de: "Verteilungseinstellungen", es: "Configuración de distribución", it: "Impostazioni distribuzione", ar: "إعدادات التوزيع", zh: "分配设置", ja: "配分設定", hi: "वितरण सेटिंग्स", pl: "Ustawienia podziału", ru: "Настройки распределения" },
  "profit.calculated": { fr: "Distribution calculée", en: "Calculated Distribution", pt: "Distribuição calculada", de: "Berechnete Verteilung", es: "Distribución calculada", it: "Distribuzione calcolata", ar: "التوزيع المحسوب", zh: "计算分配", ja: "計算された配分", hi: "गणना वितरण", pl: "Obliczony podział", ru: "Рассчитанное распределение" },
  "profit.totalRevenue": { fr: "Chiffre d'affaires total", en: "Total Revenue", pt: "Receita total", de: "Gesamtumsatz", es: "Ingresos totales", it: "Ricavi totali", ar: "إجمالي الإيرادات", zh: "总收入", ja: "総収益", hi: "कुल राजस्व", pl: "Łączne przychody", ru: "Общая выручка" },
  "profit.techShare": { fr: "Part technicien (%)", en: "Technician Share (%)", pt: "Parte do técnico (%)", de: "Techniker-Anteil (%)", es: "Parte del técnico (%)", it: "Quota tecnico (%)", ar: "حصة الفني (%)", zh: "技术员份额 (%)", ja: "技術者シェア (%)", hi: "तकनीशियन हिस्सा (%)", pl: "Udział technika (%)", ru: "Доля техника (%)" },
  "profit.partnerShare": { fr: "Part partenaire (%)", en: "Partner Share (%)", pt: "Parte do parceiro (%)", de: "Partner-Anteil (%)", es: "Parte del socio (%)", it: "Quota partner (%)", ar: "حصة الشريك (%)", zh: "合作伙伴份额 (%)", ja: "パートナーシェア (%)", hi: "साझेदार हिस्सा (%)", pl: "Udział partnera (%)", ru: "Доля партнёра (%)" },
  "profit.companyShare": { fr: "Part entreprise (%)", en: "Company Share (%)", pt: "Parte da empresa (%)", de: "Unternehmensanteil (%)", es: "Parte de la empresa (%)", it: "Quota azienda (%)", ar: "حصة الشركة (%)", zh: "公司份额 (%)", ja: "会社シェア (%)", hi: "कंपनी हिस्सा (%)", pl: "Udział firmy (%)", ru: "Доля компании (%)" },
  "profit.exceeds100": { fr: "Le total dépasse 100 %", en: "Total exceeds 100%", pt: "O total excede 100%", de: "Summe übersteigt 100 %", es: "El total supera el 100 %", it: "Il totale supera il 100%", ar: "المجموع يتجاوز 100%", zh: "总计超过100%", ja: "合計が100%を超えています", hi: "कुल 100% से अधिक", pl: "Suma przekracza 100%", ru: "Сумма превышает 100%" },

  // Upload zone
  "upload.dropOrClick": { fr: "Déposez les fichiers ici ou cliquez pour télécharger", en: "Drop files here or click to upload", pt: "Solte arquivos aqui ou clique para enviar", de: "Dateien hier ablegen oder klicken", es: "Suelte archivos aquí o haga clic para subir", it: "Trascina i file qui o clicca per caricare", ar: "أسقط الملفات هنا أو انقر للتحميل", zh: "将文件拖放到此处或点击上传", ja: "ファイルをドロップまたはクリックでアップロード", hi: "फ़ाइलें यहाँ छोड़ें या अपलोड करने के लिए क्लिक करें", pl: "Upuść pliki tutaj lub kliknij, aby przesłać", ru: "Перетащите файлы сюда или нажмите для загрузки" },
  "upload.formats": { fr: "PDF, JPG, PNG — documents d'ordre de service", en: "PDF, JPG, PNG — service order documents", pt: "PDF, JPG, PNG — documentos de ordem de serviço", de: "PDF, JPG, PNG — Serviceauftragsdokumente", es: "PDF, JPG, PNG — documentos de orden de servicio", it: "PDF, JPG, PNG — documenti ordine di servizio", ar: "PDF, JPG, PNG — مستندات أوامر الخدمة", zh: "PDF, JPG, PNG — 服务订单文档", ja: "PDF, JPG, PNG — サービスオーダー文書", hi: "PDF, JPG, PNG — सेवा आदेश दस्तावेज़", pl: "PDF, JPG, PNG — dokumenty zleceń serwisowych", ru: "PDF, JPG, PNG — документы заказ-нарядов" },
  "upload.extracting": { fr: "Extraction des données par IA…", en: "Extracting data with AI…", pt: "Extraindo dados com IA…", de: "Daten werden mit KI extrahiert…", es: "Extrayendo datos con IA…", it: "Estrazione dati con IA…", ar: "استخراج البيانات بالذكاء الاصطناعي…", zh: "正在用AI提取数据…", ja: "AIでデータ抽出中…", hi: "AI से डेटा निकाला जा रहा है…", pl: "Ekstrakcja danych przez AI…", ru: "Извлечение данных с помощью ИИ…" },
  "upload.wait": { fr: "Cela peut prendre quelques secondes", en: "This may take a few seconds", pt: "Isso pode levar alguns segundos", de: "Dies kann einige Sekunden dauern", es: "Esto puede tardar unos segundos", it: "Potrebbe richiedere alcuni secondi", ar: "قد يستغرق هذا بضع ثوان", zh: "这可能需要几秒钟", ja: "数秒かかることがあります", hi: "इसमें कुछ सेकंड लग सकते हैं", pl: "To może potrwać kilka sekund", ru: "Это может занять несколько секунд" },
  "upload.images": { fr: "Images", en: "Images", pt: "Imagens", de: "Bilder", es: "Imágenes", it: "Immagini", ar: "صور", zh: "图片", ja: "画像", hi: "छवियाँ", pl: "Obrazy", ru: "Изображения" },

  // Extracted data
  "extract.title": { fr: "Données extraites", en: "Extracted Data", pt: "Dados extraídos", de: "Extrahierte Daten", es: "Datos extraídos", it: "Dati estratti", ar: "البيانات المستخرجة", zh: "提取的数据", ja: "抽出データ", hi: "निकाला गया डेटा", pl: "Wyodrębnione dane", ru: "Извлечённые данные" },
  "extract.paymentTitle": { fr: "Données de paiement extraites", en: "Extracted Payment Data", pt: "Dados de pagamento extraídos", de: "Extrahierte Zahlungsdaten", es: "Datos de pago extraídos", it: "Dati pagamento estratti", ar: "بيانات الدفع المستخرجة", zh: "提取的付款数据", ja: "抽出された支払いデータ", hi: "निकाला गया भुगतान डेटा", pl: "Wyodrębnione dane płatności", ru: "Извлечённые платёжные данные" },
  "extract.confidence": { fr: "confiance", en: "confidence", pt: "confiança", de: "Vertrauen", es: "confianza", it: "fiducia", ar: "ثقة", zh: "置信度", ja: "信頼度", hi: "विश्वसनीयता", pl: "pewność", ru: "уверенность" },
  "extract.corrections": { fr: "Corrections manuscrites détectées", en: "Handwritten corrections detected", pt: "Correções manuscritas detectadas", de: "Handschriftliche Korrekturen erkannt", es: "Correcciones manuscritas detectadas", it: "Correzioni manoscritte rilevate", ar: "تم اكتشاف تصحيحات مكتوبة بخط اليد", zh: "检测到手写更正", ja: "手書き修正が検出されました", hi: "हस्तलिखित सुधार पाए गए", pl: "Wykryto poprawki odręczne", ru: "Обнаружены рукописные исправления" },
  "extract.saveN": { fr: "Enregistrer {n} entrée(s)", en: "Save {n} order(s)", pt: "Salvar {n} entrada(s)", de: "{n} Einträge speichern", es: "Guardar {n} entrada(s)", it: "Salva {n} voce/i", ar: "حفظ {n} إدخال(ات)", zh: "保存 {n} 条", ja: "{n} 件保存", hi: "{n} प्रविष्टि सहेजें", pl: "Zapisz {n} wpis(ów)", ru: "Сохранить {n} запись(и)" },
  "extract.noOrders": { fr: "Aucun ordre extrait. Essayez un autre document.", en: "No orders extracted. Try uploading another document.", pt: "Nenhuma ordem extraída. Tente outro documento.", de: "Keine Aufträge extrahiert. Versuchen Sie ein anderes Dokument.", es: "Sin órdenes extraídas. Intente con otro documento.", it: "Nessun ordine estratto. Prova con un altro documento.", ar: "لم يتم استخراج أي أوامر. حاول تحميل مستند آخر.", zh: "未提取到订单。请尝试上传其他文档。", ja: "注文が抽出されませんでした。別のドキュメントをお試しください。", hi: "कोई आदेश नहीं निकाला गया। कोई अन्य दस्तावेज़ आज़माएँ।", pl: "Nie wyodrębniono zleceń. Spróbuj inny dokument.", ru: "Заказы не извлечены. Попробуйте другой документ." },
  "extract.noPayments": { fr: "Aucun ordre de paiement extrait. Essayez un document plus clair.", en: "No payment orders extracted. Try uploading a clearer document.", pt: "Nenhuma ordem de pagamento extraída.", de: "Keine Zahlungsaufträge extrahiert.", es: "Sin órdenes de pago extraídas.", it: "Nessun ordine di pagamento estratto.", ar: "لم يتم استخراج أوامر دفع.", zh: "未提取到付款订单。", ja: "支払い注文が抽出されませんでした。", hi: "कोई भुगतान आदेश नहीं निकाला गया।", pl: "Nie wyodrębniono zleceń płatności.", ru: "Платёжные поручения не извлечены." },
  "extract.entries": { fr: "entrées", en: "entries", pt: "entradas", de: "Einträge", es: "entradas", it: "voci", ar: "إدخالات", zh: "条目", ja: "件", hi: "प्रविष्टियाँ", pl: "wpisów", ru: "записей" },
  "extract.saving": { fr: "Enregistrement…", en: "Saving…", pt: "Salvando…", de: "Speichern…", es: "Guardando…", it: "Salvataggio…", ar: "جارٍ الحفظ…", zh: "保存中…", ja: "保存中…", hi: "सहेजा जा रहा है…", pl: "Zapisywanie…", ru: "Сохранение…" },
  "extract.price": { fr: "Prix", en: "Price", pt: "Preço", de: "Preis", es: "Precio", it: "Prezzo", ar: "السعر", zh: "价格", ja: "価格", hi: "कीमत", pl: "Cena", ru: "Цена" },
  "extract.serviceName": { fr: "Nom du service", en: "Service name", pt: "Nome do serviço", de: "Dienstname", es: "Nombre del servicio", it: "Nome servizio", ar: "اسم الخدمة", zh: "服务名称", ja: "サービス名", hi: "सेवा का नाम", pl: "Nazwa usługi", ru: "Название услуги" },
  "extract.addService": { fr: "+ Service", en: "+ Service", pt: "+ Serviço", de: "+ Dienst", es: "+ Servicio", it: "+ Servizio", ar: "+ خدمة", zh: "+ 服务", ja: "+ サービス", hi: "+ सेवा", pl: "+ Usługa", ru: "+ Услуга" },
  "extract.listName": { fr: "Nom de la liste", en: "List Name", pt: "Nome da lista", de: "Listenname", es: "Nombre de la lista", it: "Nome lista", ar: "اسم القائمة", zh: "列表名称", ja: "リスト名", hi: "सूची का नाम", pl: "Nazwa listy", ru: "Название списка" },

  // Toasts
  "toast.saved": { fr: "Enregistré avec succès", en: "Saved successfully", pt: "Salvo com sucesso", de: "Erfolgreich gespeichert", es: "Guardado con éxito", it: "Salvato con successo", ar: "تم الحفظ بنجاح", zh: "保存成功", ja: "保存しました", hi: "सफलतापूर्वक सहेजा गया", pl: "Zapisano pomyślnie", ru: "Сохранено успешно" },
  "toast.deleted": { fr: "Supprimé avec succès", en: "Deleted successfully", pt: "Excluído com sucesso", de: "Erfolgreich gelöscht", es: "Eliminado con éxito", it: "Eliminato con successo", ar: "تم الحذف بنجاح", zh: "删除成功", ja: "削除しました", hi: "सफलतापूर्वक हटाया गया", pl: "Usunięto pomyślnie", ru: "Удалено успешно" },
  "toast.updated": { fr: "Mis à jour avec succès", en: "Updated successfully", pt: "Atualizado com sucesso", de: "Erfolgreich aktualisiert", es: "Actualizado con éxito", it: "Aggiornato con successo", ar: "تم التحديث بنجاح", zh: "更新成功", ja: "更新しました", hi: "सफलतापूर्वक अपडेट किया गया", pl: "Zaktualizowano pomyślnie", ru: "Обновлено успешно" },
  "toast.error": { fr: "Une erreur est survenue", en: "An error occurred", pt: "Ocorreu um erro", de: "Ein Fehler ist aufgetreten", es: "Ocurrió un error", it: "Si è verificato un errore", ar: "حدث خطأ", zh: "发生错误", ja: "エラーが発生しました", hi: "एक त्रुटि हुई", pl: "Wystąpił błąd", ru: "Произошла ошибка" },
};

interface LanguageContextType {
  lang: LangCode;
  setLang: (lang: LangCode) => void;
  t: (key: string, fallback?: string) => string;
  formatCurrency: (value: number) => string;
  formatDate: (date: string | Date) => string;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<LangCode>(() => {
    try {
      return (localStorage.getItem("qwork-lang") as LangCode) || "fr";
    } catch {
      return "fr";
    }
  });

  const changeLang = useCallback((newLang: LangCode) => {
    setLang(newLang);
    try { localStorage.setItem("qwork-lang", newLang); } catch {}
  }, []);

  const t = useCallback((key: string, fallback?: string): string => {
    const entry = translations[key];
    if (!entry) return fallback || key;
    return entry[lang] || entry["fr"] || fallback || key;
  }, [lang]);

  const formatCurrency = useCallback((value: number) => {
    const locale = lang === "fr" ? "fr-FR" : lang === "de" ? "de-DE" : lang === "es" ? "es-ES" : lang === "pt" ? "pt-PT" : lang === "it" ? "it-IT" : lang === "ar" ? "ar-SA" : lang === "zh" ? "zh-CN" : lang === "ja" ? "ja-JP" : lang === "hi" ? "hi-IN" : lang === "pl" ? "pl-PL" : lang === "ru" ? "ru-RU" : "en-GB";
    return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(value);
  }, [lang]);

  const formatDate = useCallback((date: string | Date) => {
    const locale = lang === "fr" ? "fr-FR" : lang === "de" ? "de-DE" : lang === "es" ? "es-ES" : lang === "pt" ? "pt-PT" : lang === "it" ? "it-IT" : lang === "en" ? "en-GB" : "fr-FR";
    return new Date(date).toLocaleDateString(locale);
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang: changeLang, t, formatCurrency, formatDate }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}

import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'en' | 'fr' | 'ar' | 'sw' | 'pt' | 'ha';

interface Translations {
  [key: string]: {
    [key in Language]: string;
  };
}

export const translations: Translations = {
  // Login / Signup
  login: {
    en: 'Login',
    fr: 'Connexion',
    ar: 'تسجيل الدخول',
    sw: 'Ingia',
    pt: 'Entrar',
    ha: 'Shiga'
  },
  signup: {
    en: 'Sign Up',
    fr: 'S\'inscrire',
    ar: 'إنشاء حساب',
    sw: 'Jisajili',
    pt: 'Cadastrar',
    ha: 'Yi Rajista'
  },
  username: {
    en: 'Username',
    fr: 'Nom d\'utilisateur',
    ar: 'اسم المستخدم',
    sw: 'Jina la mtumiaji',
    pt: 'Nome de usuário',
    ha: 'Sunan mai amfani'
  },
  password: {
    en: 'Password',
    fr: 'Mot de passe',
    ar: 'كلمة المرور',
    sw: 'Nywila',
    pt: 'Senha',
    ha: 'Kalmar sirri'
  },
  fullName: {
    en: 'Full Name',
    fr: 'Nom complet',
    ar: 'الاسم الكامل',
    sw: 'Jina kamili',
    pt: 'Nome completo',
    ha: 'Cikakken suna'
  },
  dontHaveAccount: {
    en: "Don't have an account?",
    fr: "Vous n'avez pas de compte ?",
    ar: "ليس لديك حساب؟",
    sw: "Hauna akaunti?",
    pt: "Não tem uma conta?",
    ha: "Ba ku da asusu?"
  },
  alreadyHaveAccount: {
    en: "Already have an account?",
    fr: "Vous avez déjà un compte ?",
    ar: "لديك حساب بالفعل؟",
    sw: "Tayari una akaunti?",
    pt: "Já tem uma conta?",
    ha: "Kuna da asusu riga?"
  },
  welcomeBack: {
    en: 'Welcome Back',
    fr: 'Bon retour',
    ar: 'مرحباً بعودتك',
    sw: 'Karibu tena',
    pt: 'Bem-vindo de volta',
    ha: 'Barka da dawowa'
  },
  welcomeToPharmacyFlow: {
    en: 'Welcome to Pharmacy Flow',
    fr: 'Bienvenue sur Pharmacy Flow',
    ar: 'مرحباً بك في Pharmacy Flow',
    sw: 'Karibu kwenye Pharmacy Flow',
    pt: 'Bem-vindo ao Pharmacy Flow',
    ha: 'Barka da zuwa Pharmacy Flow'
  },
  goodMorning: {
    en: 'Good morning',
    fr: 'Bonjour',
    ar: 'صباح الخير',
    sw: 'Habari ya asubuhi',
    pt: 'Bom dia',
    ha: 'Ina kwana'
  },
  goodAfternoon: {
    en: 'Good afternoon',
    fr: 'Bon après-midi',
    ar: 'مساء الخير',
    sw: 'Habari ya mchana',
    pt: 'Boa tarde',
    ha: 'Barka da yamma'
  },
  goodEvening: {
    en: 'Good evening',
    fr: 'Bonsoir',
    ar: 'مساء الخير',
    sw: 'Habari ya jioni',
    pt: 'Boa noite',
    ha: 'Barka da dare'
  },
  getStarted: {
    en: 'Get Started',
    fr: 'Commencer',
    ar: 'ابدأ الآن',
    sw: 'Anza sasa',
    pt: 'Começar',
    ha: 'Fara yanzu'
  },
  loginNow: {
    en: 'Login Now',
    fr: 'Se connecter maintenant',
    ar: 'سجل دخولك الآن',
    sw: 'Ingia sasa',
    pt: 'Entrar agora',
    ha: 'Shiga yanzu'
  },
  signupNow: {
    en: 'Sign Up Now',
    fr: 'S\'inscrire maintenant',
    ar: 'سجل الآن',
    sw: 'Jisajili sasa',
    pt: 'Cadastrar agora',
    ha: 'Yi rajista yanzu'
  },
  businessSuccess: {
    en: 'Business Success Stories',
    fr: 'Histoires de réussite d\'entreprises',
    ar: 'قصص نجاح الأعمال',
    sw: 'Hadithi za Mafanikio ya Biashara',
    pt: 'Histórias de sucesso de negócios',
    ha: 'Labaran Nasarar Kasuwanci'
  },
  businessSuccessDesc: {
    en: 'See how thousands of pharmacies are scaling with Pharmacy Flow.',
    fr: 'Découvrez comment des milliers de pharmacies se développent avec Pharmacy Flow.',
    ar: 'شاهد كيف تتوسع آلاف الصيدليات مع Pharmacy Flow.',
    sw: 'Ona jinsi maelfu ya maduka ya dawa yanavyokua na Pharmacy Flow.',
    pt: 'Veja como milhares de farmácias estão crescendo com o Pharmacy Flow.',
    ha: 'Dubi yadda dubban gidajen magani ke haɓaka tare da Pharmacy Flow.'
  },
  trustedBy: {
    en: 'Trusted by over 10,000+ businesses worldwide.',
    fr: 'Approuvé par plus de 10 000 entreprises dans le monde.',
    ar: 'موثوق به من قبل أكثر من 10,000 شركة حول العالم.',
    sw: 'Inaaminika na zaidi ya biashara 10,000+ ulimwenguni kote.',
    pt: 'Confiado por mais de 10.000 empresas em todo o mundo.',
    ha: 'Sama da kasuwanci 10,000+ ne suka amince da su a duk duniya.'
  },
  slide1Title: {
    en: 'Pharmacy Excellence',
    fr: 'Excellence pharmaceutique',
    ar: 'التميز الصيدلاني',
    sw: 'Ubora wa Duka la Dawa',
    pt: 'Excelência Farmacêutica',
    ha: 'Kyakkyawan Shagon Magani'
  },
  slide1Desc: {
    en: 'Modern pharmacies manage prescription and over-the-counter inventory with ease.',
    fr: 'Les pharmacies modernes gèrent les stocks de médicaments sur ordonnance et en vente libre en toute simplicité.',
    ar: 'تدير الصيدليات الحديثة مخزون الأدوية التي لا تستلزم وصفة طبية والوصفات الطبية بسهولة.',
    sw: 'Maduka ya dawa ya kisasa yanasimamia orodha ya maagizo na dawa za dukani kwa urahisi.',
    pt: 'Farmácias modernas gerenciam o estoque de medicamentos com e sem receita com facilidade.',
    ha: 'Shagunan magani na zamani suna sarrafa bayanan magunguna cikin sauƙi.'
  },
  slide2Title: {
    en: 'Healthcare Growth',
    fr: 'Croissance des soins de santé',
    ar: 'نمو الرعاية الصحية',
    sw: 'Ukuaji wa Huduma ya Afya',
    pt: 'Crescimento da Saúde',
    ha: 'Haɓaka Kiwon Lafiya'
  },
  slide2Desc: {
    en: 'Clinics and pharmacies track medication sales and expenses in real-time.',
    fr: 'Les cliniques et les pharmacies suivent les ventes de médicaments et les dépenses en temps réel.',
    ar: 'تتتبع العيادات والصيدليات مبيعات الأدوية والمصاريف في الوقت الفعلي.',
    sw: 'Kliniki na maduka ya dawa hufuatilia mauzo ya dawa na gharama kwa wakati halisi.',
    pt: 'Clínicas e farmácias acompanham vendas de medicamentos e despesas em tempo real.',
    ha: 'Asibitoci da gidajen magani suna bin diddigin tallace-tallace na magunguna da kashe kuɗi a cikin lokaci na gaske.'
  },
  slide3Title: {
    en: 'Patient Service Efficiency',
    fr: 'Efficacité du service aux patients',
    ar: 'كفاءة خدمة المرضى',
    sw: 'Ufanisi wa Huduma kwa Wagonjwa',
    pt: 'Eficiência no Atendimento ao Paciente',
    ha: 'Ingancin Sabis na Marasa Lafiya'
  },
  slide3Desc: {
    en: 'Consultation rooms and labs manage patient records and billing professionally.',
    fr: 'Les salles de consultation et les laboratoires gèrent les dossiers des patients et la facturation de manière professionnelle.',
    ar: 'تدير غرف الاستشارة والمختبرات سجلات المرضى والفواتير باحترافية.',
    sw: 'Vyumba vya mashauriano na maabara hudhibiti rekodi za wagonjwa na utozaji kitaaluma.',
    pt: 'Salas de consulta e laboratórios gerenciam registros de pacientes e faturamento profissionalmente.',
    ha: 'Dakunan shawarwari da dakunan gwaje-gwaje suna sarrafa bayanan marasa lafiya da biyan kuɗi cikin ƙwarewa.'
  },
  createAccount: {
    en: 'Create Account',
    fr: 'Créer un compte',
    ar: 'إنشاء حساب جديد',
    sw: 'Fungua akaunti',
    pt: 'Criar conta',
    ha: 'Ƙirƙiri asusu'
  },
  loginToContinue: {
    en: 'Please login to continue to your dashboard',
    fr: 'Veuillez vous connecter pour continuer vers votre tableau de bord',
    ar: 'يرجى تسجيل الدخول للمتابعة إلى لوحة التحكم الخاصة بك',
    sw: 'Tafadhali ingia ili kuendelea kwenye dashibodi yako',
    pt: 'Por favor, faça login para continuar para o seu painel',
    ha: 'Da fatan za a shiga don ci gaba zuwa dashboard ɗin ku'
  },
  signupToGetStarted: {
    en: 'Sign up to get started with Pharmacy Flow',
    fr: 'Inscrivez-vous pour commencer avec Pharmacy Flow',
    ar: 'سجل للحصول على بدأ مع Pharmacy Flow',
    sw: 'Jisajili ili kuanza na Pharmacy Flow',
    pt: 'Cadastre-se para começar com o Pharmacy Flow',
    ha: 'Yi rajista don farawa da Pharmacy Flow'
  },
  startWithPharmacyFlow: {
    en: 'Start with Pharmacy Flow',
    fr: 'Commencer avec Pharmacy Flow',
    ar: 'ابدأ مع Pharmacy Flow',
    sw: 'Anza na Pharmacy Flow',
    pt: 'Comece com o Pharmacy Flow',
    ha: 'Fara da Pharmacy Flow'
  },
  mostPowerfulTool: {
    en: 'The most powerful tool for your business growth.',
    fr: 'L\'outil le plus puissant pour la croissance de votre entreprise.',
    ar: 'الأداة الأقوى لنمو عملك.',
    sw: 'Chombo chenye nguvu zaidi kwa ukuaji wa biashara yako.',
    pt: 'A ferramenta mais poderosa para o crescimento do seu negócio.',
    ha: 'Mafi kyawun kayan aiki don haɓaka kasuwancin ku.'
  },
  multiPharmacyReady: {
    en: 'Multi-Pharmacy Ready',
    fr: 'Prêt pour le multi-boutique',
    ar: 'جاهز للمتاجر المتعددة',
    sw: 'Tayari kwa Maduka Mengi',
    pt: 'Pronto para Multi-lojas',
    ha: 'Shirye don Shaguna Masu Yawa'
  },
  multiPharmacyReadyDesc: {
    en: 'Manage multiple branches and track performance across locations.',
    fr: 'Gérez plusieurs succursales et suivez les performances sur plusieurs sites.',
    ar: 'إدارة فروع متعددة وتتبع الأداء عبر المواقع.',
    sw: 'Dhibiti matawi mengi na ufuatilie utendakazi katika maeneo yote.',
    pt: 'Gerencie várias filiais e acompanhe o desempenho em vários locais.',
    ha: 'Sarrafa rassa da yawa kuma bi diddigin aiki a duk wurare.'
  },
  secureReliable: {
    en: 'Secure & Reliable',
    fr: 'Sécurisé et fiable',
    ar: 'آمن وموثوق',
    sw: 'Salama na ya Kuaminika',
    pt: 'Seguro e Confiável',
    ha: 'Amintaccen & Dogara'
  },
  secureReliableDesc: {
    en: 'Your data is encrypted and backed up to Google Drive automatically.',
    fr: 'Vos données sont cryptées et sauvegardées automatiquement sur Google Drive.',
    ar: 'يتم تشفير بياناتك ونسخها احتياطيًا إلى Google Drive تلقائيًا.',
    sw: 'Data yako imesimbwa kwa njia fiche na kuhifadhiwa kwenye Google Drive kiotomatiki.',
    pt: 'Seus dados são criptografados e o backup é feito no Google Drive automaticamente.',
    ha: 'An rufaffen bayanan ku kuma ana adana su zuwa Google Drive ta atomatik.'
  },
  advancedReporting: {
    en: 'Advanced Reporting',
    fr: 'Rapports avancés',
    ar: 'تقارير متقدمة',
    sw: 'Ripoti ya Juu',
    pt: 'Relatórios Avançados',
    ha: 'Rahoton Ci Gaba'
  },
  advancedReportingDesc: {
    en: 'Get deep insights into your sales, profit, and customer behavior.',
    fr: 'Obtenez des informations approfondies sur vos ventes, vos bénéfices et le comportement de vos clients.',
    ar: 'احصل على رؤى عميقة حول مبيعاتك وأرباحك وسلوك عملائك.',
    sw: 'Pata maarifa ya kina kuhusu mauzo yako, faida, na tabia ya mteja.',
    pt: 'Obtenha insights profundos sobre suas vendas, lucros e comportamento do cliente.',
    ha: 'Sami zurfin fahimta game da tallace-tallace ku, riba, da halayen abokin ciniki.'
  },
  experiencePower: {
    en: 'Experience the power of Pharmacy Flow today. Sign up to get started!',
    fr: 'Découvrez la puissance de Pharmacy Flow dès aujourd\'hui. Inscrivez-vous pour commencer !',
    ar: 'اختبر قوة Pharmacy Flow اليوم. سجل للبدء!',
    sw: 'Pata uzoefu wa nguvu ya Pharmacy Flow leo. Jisajili ili uanze!',
    pt: 'Experimente o poder do Pharmacy Flow hoje. Cadastre-se para começar!',
    ha: 'Kwarewa ikon Pharmacy Flow a yau. Yi rajista don farawa!'
  },
  joinPharmacyFlow: {
    en: 'Join Pharmacy Flow and grow your pharmacy',
    fr: 'Rejoignez Pharmacy Flow et développez votre pharmacie',
    ar: 'انضم إلى Pharmacy Flow وطور صيدليتك',
    sw: 'Jiunge na Pharmacy Flow na ukuze duka lako la dawa',
    pt: 'Junte-se ao Pharmacy Flow e expanda sua farmácia',
    ha: 'Kasance tare da Pharmacy Flow kuma haɓaka shagon sayar da magani'
  },
  enterFullName: {
    en: 'Enter your full name',
    fr: 'Entrez votre nom complet',
    ar: 'أدخل اسمك الكامل',
    sw: 'Ingiza jina lako kamili',
    pt: 'Insira seu nome completo',
    ha: 'Shigar da cikakken sunan ku'
  },
  chooseUsername: {
    en: 'Choose a username',
    fr: 'Choisissez un nom d\'utilisateur',
    ar: 'اختر اسم مستخدم',
    sw: 'Chagua jina la mtumiaji',
    pt: 'Escolha um nome de usuário',
    ha: 'Zaɓi sunan mai amfani'
  },
  creatingAccount: {
    en: 'Creating Account...',
    fr: 'Création du compte...',
    ar: 'جاري إنشاء الحساب...',
    sw: 'Inafungua akaunti...',
    pt: 'Criando conta...',
    ha: 'Ana ƙirƙirar asusu...'
  },
  signupFailed: {
    en: 'Signup failed. Username might already be taken.',
    fr: 'Échec de l\'inscription. Le nom d\'utilisateur est peut-être déjà pris.',
    ar: 'فشل التسجيل. قد يكون اسم المستخدم مأخوذًا بالفعل.',
    sw: 'Usajili umeshindwa. Jina la mtumiaji linaweza kuwa tayari limechukuliwa.',
    pt: 'Falha no cadastro. O nome de usuário já pode estar em uso.',
    ha: 'Rajista ya gaza. Wataƙila an riga an ɗauki sunan mai amfani.'
  },
  // Dashboard
  todaysRevenue: {
    en: "Today's Revenue",
    fr: "Chiffre d'affaires du jour",
    ar: "إيرادات اليوم",
    sw: "Mapato ya Leo",
    pt: "Receita de Hoje",
    ha: "Kuɗin Shiga na Yau"
  },
  todaysProfit: {
    en: "Today's Profit",
    fr: "Bénéfice du jour",
    ar: "ربح اليوم",
    sw: "Faida ya Leo",
    pt: "Lucro de Hoje",
    ha: "Riba ta Yau"
  },
  todaysExpenses: {
    en: "Today's Expenses",
    fr: "Dépenses du jour",
    ar: "مصاريف اليوم",
    sw: "Gharama za Leo",
    pt: "Despesas de Hoje",
    ha: "Kashe-kashen Yau"
  },
  netProfit: {
    en: "Net Profit",
    fr: "Bénéfice net",
    ar: "صافي الربح",
    sw: "Faida Halisi",
    pt: "Lucro Líquido",
    ha: "Riba Bayan Kashewa"
  },
  todaysSales: {
    en: "Today's Sales",
    fr: "Ventes du jour",
    ar: "مبيعات اليوم",
    sw: "Mauzo ya Leo",
    pt: "Vendas de Hoje",
    ha: "Tallace-tallace na Yau"
  },
  lowStockItems: {
    en: "Low Stock Items",
    fr: "Articles en rupture de stock",
    ar: "الأصناف منخفضة المخزون",
    sw: "Bidhaa za Akiba ya Chini",
    pt: "Itens com Estoque Baixo",
    ha: "Kayayyakin da Suka Rage"
  },
  expiringSoon: {
    en: "Expiring Soon",
    fr: "Expire bientôt",
    ar: "تنتهي صلاحيته قريبًا",
    sw: "Muda wa kuisha unakaribia",
    pt: "Expirando em breve",
    ha: "Zai Kare Nan Ba Da Daɗewa Ba"
  },
  actionNeeded: {
    en: "Action Needed",
    fr: "Action requise",
    ar: "مطلوب اتخاذ إجراء",
    sw: "Hatua Inahitajika",
    pt: "Ação Necessária",
    ha: "Ana Bukatar Mataki"
  },
  allGood: {
    en: "All Good",
    fr: "Tout va bien",
    ar: "كل شيء جيد",
    sw: "Kila kitu kiko sawa",
    pt: "Tudo Certo",
    ha: "Komai Lafiya"
  },
  allClear: {
    en: "All Clear",
    fr: "Tout est clair",
    ar: "كل شيء واضح",
    sw: "Kila kitu kiko wazi",
    pt: "Tudo Limpo",
    ha: "Komai Ya Warke"
  },
  spending: {
    en: "Spending",
    fr: "Dépenses",
    ar: "إنفاق",
    sw: "Matumizi",
    pt: "Gastos",
    ha: "Kashewa"
  },
  afterExpenses: {
    en: "After Expenses",
    fr: "Après dépenses",
    ar: "بعد المصاريف",
    sw: "Baada ya Gharama",
    pt: "Após Despesas",
    ha: "Bayan Kashewa"
  },
  days30: {
    en: "30 Days",
    fr: "30 jours",
    ar: "30 يومًا",
    sw: "Siku 30",
    pt: "30 Dias",
    ha: "Kwanaki 30"
  },
  // Sidebar
  overview: {
    en: "Overview",
    fr: "Aperçu",
    ar: "نظرة عامة",
    sw: "Muhtasari",
    pt: "Visão Geral",
    ha: "Bayanin Gaba ɗaya"
  },
  inventory: {
    en: "Inventory",
    fr: "Inventaire",
    ar: "المخزون",
    sw: "Hesabu",
    pt: "Inventário",
    ha: "Kayan Gida"
  },
  newSale: {
    en: "New Sale",
    fr: "Nouvelle vente",
    ar: "بيع جديد",
    sw: "Mauzo Mapya",
    pt: "Nova Venda",
    ha: "Sabuwar Sayarwa"
  },
  debtBook: {
    en: "Debt Book",
    fr: "Livre de dettes",
    ar: "دفتر الديون",
    sw: "Kitabu cha Madeni",
    pt: "Livro de Dívidas",
    ha: "Littafin Bashi"
  },
  history: {
    en: "History",
    fr: "Historique",
    ar: "السجل",
    sw: "Historia",
    pt: "Histórico",
    ha: "Tarihi"
  },
  reports: {
    en: "Reports",
    fr: "Rapports",
    ar: "التقارير",
    sw: "Ripoti",
    pt: "Relatórios",
    ha: "Rahotanni"
  },
  expenses: {
    en: "Expenses",
    fr: "Dépenses",
    ar: "المصاريف",
    sw: "Gharama",
    pt: "Despesas",
    ha: "Kashewa"
  },
  invoices: {
    en: "Invoices",
    fr: "Factures",
    ar: "الفواتير",
    sw: "Ankara",
    pt: "Faturas",
    ha: "Rasitoci"
  },
  payroll: {
    en: "Payroll",
    fr: "Paie",
    ar: "كشف الرواتب",
    sw: "Mishahara",
    pt: "Folha de Pagamento",
    ha: "Albashin Ma'aikata"
  },
  purchases: {
    en: "New Goods",
    fr: "Achats",
    ar: "المشتريات",
    sw: "Ununuzi",
    pt: "Compras",
    ha: "Sayayya"
  },
  marketOrders: {
    en: "Market Orders",
    fr: "Commandes du marché",
    ar: "طلبات السوق",
    sw: "Oda za Soko",
    pt: "Ordens de Mercado",
    ha: "Odar Kasuwa"
  },
  calendar: {
    en: "Calendar",
    fr: "Calendrier",
    ar: "التقويم",
    sw: "Kalenda",
    pt: "Calendário",
    ha: "Kalandar"
  },
  returns: {
    en: "Returns",
    fr: "Retours",
    ar: "المرتجعات",
    sw: "Marejesho",
    pt: "Devoluções",
    ha: "Kayayyakin da Aka Dawo da Su"
  },
  tutorials: {
    en: "Tutorials",
    fr: "Tutoriels",
    ar: "دروس تعليمية",
    sw: "Mafunzo",
    pt: "Tutoriais",
    ha: "Koyawa"
  },
  usersRoles: {
    en: "Users & Roles",
    fr: "Utilisateurs et rôles",
    ar: "المستخدمون والأدوار",
    sw: "Watumiaji na Majukumu",
    pt: "Usuários e Funções",
    ha: "Masu Amfani & Matsayi"
  },
  logout: {
    en: "Logout",
    fr: "Déconnexion",
    ar: "تسجيل الخروج",
    sw: "Ondoka",
    pt: "Sair",
    ha: "Fita"
  },
  systemOnline: {
    en: "System Online",
    fr: "Système en ligne",
    ar: "النظام متصل",
    sw: "Mfumo uko Mtandaoni",
    pt: "Sistema Online",
    ha: "Tsarin yana kan layi"
  },
  online: {
    en: "Online",
    fr: "En ligne",
    ar: "متصل",
    sw: "Mtandaoni",
    pt: "Online",
    ha: "Kan layi"
  },
  systemOffline: {
    en: "System Offline",
    fr: "Système hors ligne",
    ar: "النظام غير متصل",
    sw: "Mfumo uko Nje ya Mtandao",
    pt: "Sistema Offline",
    ha: "Tsarin baya kan layi"
  },
  workingOffline: {
    en: "Working Offline",
    fr: "Mode hors ligne actif",
    ar: "العمل دون اتصال",
    sw: "Kufanya Kazi Nje ya Mtandao",
    pt: "Trabalhando Offline",
    ha: "Aiki ba tare da intanet ba"
  },
  offline: {
    en: "Offline",
    fr: "Hors ligne",
    ar: "غير متصل",
    sw: "Nje ya Mtandao",
    pt: "Offline",
    ha: "Baya kan layi"
  },
  allInOneSolution: {
    en: 'The all-in-one solution for your pharmacy operations.',
    fr: 'La solution tout-en-un pour votre commerce de détail.',
    ar: 'الحل الشامل لأعمال التجزئة الخاصة بك.',
    sw: 'Suluhisho la yote kwa moja kwa biashara yako ya rejareja.',
    pt: 'A solução completa para o seu negócio de varejo.',
    ha: 'Magani na gaba ɗaya don kasuwancin ku na dillali.'
  },
  smartInventory: {
    en: 'Smart Inventory',
    fr: 'Inventaire intelligent',
    ar: 'مخزون ذكي',
    sw: 'Hesabu ya Akili',
    pt: 'Inventário Inteligente',
    ha: 'Kayan Gida Mai Wayo'
  },
  smartInventoryDesc: {
    en: 'Track stock levels and get low-stock alerts automatically.',
    fr: 'Suivez les niveaux de stock et recevez automatiquement des alertes de stock bas.',
    ar: 'تتبع مستويات المخزون واحصل على تنبيهات انخفاض المخزون تلقائيًا.',
    sw: 'Fuatilia viwango vya hisa na upate arifa za hisa za chini kiotomatiki.',
    pt: 'Acompanhe os níveis de estoque e receba alertas de estoque baixo automaticamente.',
    ha: 'Kasance da matakan hannun jari kuma sami faɗakarwar ƙarancin hannun jari ta atomatik.'
  },
  fastCheckout: {
    en: 'Fast Checkout',
    fr: 'Paiement rapide',
    ar: 'دفع سريع',
    sw: 'Malipo ya Haraka',
    pt: 'Checkout Rápido',
    ha: 'Biyan Kuɗi Cikin Sauri'
  },
  fastCheckoutDesc: {
    en: 'Process sales in seconds with barcode support and split payments.',
    fr: 'Traitez les ventes en quelques secondes avec le support des codes-barres et les paiements fractionnés.',
    ar: 'معالجة المبيعات في ثوانٍ مع دعم الباركود والمدفوعات المجزأة.',
    sw: 'Chakata mauzo kwa sekunde ukitumia usaidizi wa msimbo pau na malipo ya mgawanyiko.',
    pt: 'Processar vendas em segundos com suporte a código de barras e pagamentos divididos.',
    ha: 'Gudanar da tallace-tallace a cikin daƙiƙa tare da tallafin lambar sirri da biyan kuɗi na raba.'
  },
  professionalReceipts: {
    en: 'Professional Receipts',
    fr: 'Reçus professionnels',
    ar: 'إيصالات احترافية',
    sw: 'Risiti za Kitaalamu',
    pt: 'Recibos Profissionais',
    ha: 'Rasitoci na Kwararru'
  },
  professionalReceiptsDesc: {
    en: 'Print high-quality receipts via Bluetooth or Android Print Service.',
    fr: 'Imprimez des reçus de haute qualité via Bluetooth ou le service d\'impression Android.',
    ar: 'اطبع إيصالات عالية الجودة عبر البلوتوث أو خدمة طباعة أندرويد.',
    sw: 'Chapisha risiti za ubora wa juu kupitia Bluetooth au Huduma ya Kuchapisha ya Android.',
    pt: 'Imprima recibos de alta qualidade via Bluetooth ou Serviço de Impressão Android.',
    ha: 'Buga rasitoci masu inganci ta Bluetooth ko Sabis na Buga na Android.'
  },
  joinThousands: {
    en: 'Join thousands of pharmacies using Pharmacy Flow to streamline their operations.',
    fr: 'Rejoignez des milliers de pharmacies utilisant Pharmacy Flow pour simplifier leurs opérations.',
    ar: 'انضم إلى آلاف الصيدليات التي تستخدم Pharmacy Flow لتبسيط عملياتها.',
    sw: 'Jiunge na maelfu ya maduka ya dawa yanayotumia Pharmacy Flow ili kurahisisha shughuli zao.',
    pt: 'Junte-se a milhares de farmácias que usam o Pharmacy Flow para agilizar suas operações.',
    ha: 'Kasance tare da dubban gidajen magani da ke amfani da Pharmacy Flow don daidaita ayyukansu.'
  },
  signIn: {
    en: 'Sign In',
    fr: 'Se connecter',
    ar: 'تسجيل الدخول',
    sw: 'Ingia',
    pt: 'Entrar',
    ha: 'Shiga'
  },
  enterCredentials: {
    en: 'Enter your credentials to continue',
    fr: 'Entrez vos identifiants pour continuer',
    ar: 'أدخل بيانات الاعتماد الخاصة بك للمتابعة',
    sw: 'Ingiza kitambulisho chako ili kuendelea',
    pt: 'Insira suas credenciais para continuar',
    ha: 'Shigar da bayanan ku don ci gaba'
  },
  enterUsername: {
    en: 'Enter username',
    fr: 'Entrez le nom d\'utilisateur',
    ar: 'أدخل اسم المستخدم',
    sw: 'Ingiza jina la mtumiaji',
    pt: 'Insira o nome de usuário',
    ha: 'Shigar da sunan mai amfani'
  },
  verifying: {
    en: 'Verifying...',
    fr: 'Vérification...',
    ar: 'جاري التحقق...',
    sw: 'Inathibitisha...',
    pt: 'Verificando...',
    ha: 'Ana tabbatarwa...'
  },
  // Settings
  settings: {
    en: 'Settings',
    fr: 'Paramètres',
    ar: 'الإعدادات',
    sw: 'Mipangilio',
    pt: 'Configurações',
    ha: 'Saituna'
  },
  language: {
    en: 'Language',
    fr: 'Langue',
    ar: 'اللغة',
    sw: 'Lugha',
    pt: 'Idioma',
    ha: 'Yare'
  },
  selectLanguage: {
    en: 'Select Language',
    fr: 'Choisir la langue',
    ar: 'اختر اللغة',
    sw: 'Chagua lugha',
    pt: 'Selecionar idioma',
    ha: 'Zaɓi yare'
  },
  pharmacySettings: {
    en: 'Pharmacy Settings',
    fr: 'Paramètres de la boutique',
    ar: 'إعدادات المتجر',
    sw: 'Mipangilio ya duka',
    pt: 'Configurações da loja',
    ha: 'Saitunan shago'
  },
  generalSettings: {
    en: 'General Settings',
    fr: 'Paramètres généraux',
    ar: 'الإعدادات العامة',
    sw: 'Mipangilio ya jumla',
    pt: 'Configurações gerais',
    ha: 'Saituna na gaba ɗaya'
  },
  languageDesc: {
    en: 'Choose your preferred language for the application interface.',
    fr: 'Choisissez votre langue préférée pour l\'interface de l\'application.',
    ar: 'اختر لغتك المفضلة لواجهة التطبيق.',
    sw: 'Chagua lugha unayopendelea kwa kiolesura cha programu.',
    pt: 'Escolha o seu idioma preferido para a interface do aplicativo.',
    ha: 'Zaɓi yaren da kuka fi so don tsarin aikace-aikacen.'
  },
  pharmacyInfo: {
    en: 'Pharmacy Info',
    fr: 'Infos boutique',
    ar: 'معلومات المتجر',
    sw: 'Maelezo ya Duka',
    pt: 'Informações da Loja',
    ha: 'Bayanin Shago'
  },
  inventoryInfo: {
    en: 'Inventory Info',
    fr: 'Infos inventaire',
    ar: 'معلومات المخزون',
    sw: 'Maelezo ya Hesabu',
    pt: 'Informações de Inventário',
    ha: 'Bayanin Kaya'
  },
  localization: {
    en: 'Localization',
    fr: 'Localisation',
    ar: 'الموقع واللغة',
    sw: 'Ujanibishaji',
    pt: 'Localização',
    ha: 'Yanki'
  },
  taxSettings: {
    en: 'Tax Settings',
    fr: 'Paramètres fiscaux',
    ar: 'إعدادات الضرائب',
    sw: 'Mipangilio ya Kodi',
    pt: 'Configurações de Impostos',
    ha: 'Saitunan Haraji'
  },
  notifications: {
    en: 'Notifications',
    fr: 'Notifications',
    ar: 'الإشعارات',
    sw: 'Arifa',
    pt: 'Notificações',
    ha: 'Sanarwa'
  },
  printing: {
    en: 'Printing',
    fr: 'Impression',
    ar: 'الطباعة',
    sw: 'Uchapishaji',
    pt: 'Impressão',
    ha: 'Bugawa'
  },
  businessRules: {
    en: 'Business Rules',
    fr: 'Règles commerciales',
    ar: 'قواعد العمل',
    sw: 'Sheria za Biashara',
    pt: 'Regras de Negócio',
    ha: 'Dokokin Kasuwanci'
  },
  database: {
    en: 'Database',
    fr: 'Base de données',
    ar: 'قاعدة البيانات',
    sw: 'Hifadhidata',
    pt: 'Banco de Dados',
    ha: 'Taskar Bayanai'
  },
  pharmacyInfoSubtitle: {
    en: 'Business identity and contact details',
    fr: 'Identité de l\'entreprise et coordonnées',
    ar: 'هوية العمل وتفاصيل الاتصال',
    sw: 'Utambulisho wa biashara na maelezo ya mawasiliano',
    pt: 'Identidade comercial e detalhes de contato',
    ha: 'Bayanin kasuwanci da bayanan tuntuɓar'
  },
  inventoryInfoSubtitle: {
    en: 'Manage inventory classification',
    fr: 'Gérer la classification des stocks',
    ar: 'إدارة تصنيف المخزون',
    sw: 'Dhibiti uainishaji wa hesabu',
    pt: 'Gerenciar classificação de inventário',
    ha: 'Sarrafa rarraba kaya'
  },
  localizationSubtitle: {
    en: 'Currency and regional preferences',
    fr: 'Devise et préférences régionales',
    ar: 'العملة والتفضيلات الإقليمية',
    sw: 'Sarafu na mapendeleo ya kikanda',
    pt: 'Moeda e preferências regionais',
    ha: 'Kudin da zaɓin yanki'
  },
  taxSettingsSubtitle: {
    en: 'Manage VAT and other taxes',
    fr: 'Gérer la TVA et les autres taxes',
    ar: 'إدارة ضريبة القيمة المضافة والضرائب الأخرى',
    sw: 'Dhibiti VAT na kodi zingine',
    pt: 'Gerenciar IVA e outros impostos',
    ha: 'Sarrafa harajin VAT da sauran haraji'
  },
  notificationsSubtitle: {
    en: 'Configure alerts and sounds',
    fr: 'Configurer les alertes et les sons',
    ar: 'تكوين التنبيهات والأصوات',
    sw: 'Sanidi arifa na sauti',
    pt: 'Configurar alertas e sons',
    ha: 'Sanya sanarwa da sauti'
  },
  printingSubtitle: {
    en: 'Receipt and printer configuration',
    fr: 'Configuration des reçus et de l\'imprimante',
    ar: 'تكوين الإيصالات والطابعة',
    sw: 'Usanidi wa risiti na printa',
    pt: 'Configuração de recibos e impressora',
    ha: 'Sanya rasit da na\'urar bugawa'
  },
  businessRulesSubtitle: {
    en: 'Debt limits and payment rules',
    fr: 'Limites d\'endettement et règles de paiement',
    ar: 'حدود الدين وقواعد الدفع',
    sw: 'Mipaka ya madeni na sheria za malipo',
    pt: 'Limites de dívida e regras de pagamento',
    ha: 'Iyakar bashi da dokokin biyan kuɗi'
  },
  databaseSubtitle: {
    en: 'Backup and restore your data',
    fr: 'Sauvegarder et restaurer vos données',
    ar: 'نسخ احتياطي واستعادة بياناتك',
    sw: 'Hifadhi na urejeshe data yako',
    pt: 'Backup e restauração de seus dados',
    ha: 'Ajiye da dawo da bayanan ku'
  },
  currency: {
    en: 'Currency',
    fr: 'Devise',
    ar: 'العملة',
    sw: 'Sarafu',
    pt: 'Moeda',
    ha: 'Kudin'
  },
  pharmacyName: {
    en: 'Pharmacy Name',
    fr: 'Nom de la boutique',
    ar: 'اسم المتجر',
    sw: 'Jina la duka',
    pt: 'Nome da loja',
    ha: 'Sunan shago'
  },
  phoneNumber: {
    en: 'Phone Number',
    fr: 'Numéro de téléphone',
    ar: 'رقم الهاتف',
    sw: 'Nambari ya simu',
    pt: 'Número de telefone',
    ha: 'Lambar waya'
  },
  address: {
    en: 'Address',
    fr: 'Adresse',
    ar: 'العنوان',
    sw: 'Anwani',
    pt: 'Endereço',
    ha: 'Adireshin'
  },
  saveChanges: {
    en: 'Save Changes',
    fr: 'Enregistrer les modifications',
    ar: 'حفظ التغييرات',
    sw: 'Hifadhi mabadiliko',
    pt: 'Salvar alterações',
    ha: 'Ajiye canje-canje'
  },
  // Common
  cancel: {
    en: 'Cancel',
    fr: 'Annuler',
    ar: 'إلغاء',
    sw: 'Ghairi',
    pt: 'Cancelar',
    ha: 'Soke'
  },
  success: {
    en: 'Success',
    fr: 'Succès',
    ar: 'نجاح',
    sw: 'Mafanikio',
    pt: 'Sucesso',
    ha: 'Nasarar'
  },
  error: {
    en: 'Error',
    fr: 'Erreur',
    ar: 'خطأ',
    sw: 'Hitilafu',
    pt: 'Erro',
    ha: 'Kuskure'
  },
  referrals: {
    en: 'Refer & Earn',
    fr: 'Parrainage & Récompenses',
    ar: 'الإحالة والمكافآت',
    sw: 'Rejelea na Upate',
    pt: 'Indique e Ganhe',
    ha: 'Tura Aboki & Samu'
  },
  subscriptions: {
    en: 'Subscriptions',
    fr: 'Abonnements',
    ar: 'الاشتراكات',
    sw: 'Usajili',
    pt: 'Assinaturas',
    ha: 'Biyan Kuɗi'
  }
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('app_language');
    return (saved as Language) || 'en';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('app_language', lang);
  };

  const t = (key: string) => {
    if (!translations[key]) return key;
    return translations[key][language] || translations[key]['en'];
  };

  const isRTL = language === 'ar';

  useEffect(() => {
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language, isRTL]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

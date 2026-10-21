// Site legal documents: Terms of Service, Privacy Policy, Disclaimer and Other Statements.
// Each clause carries the authoritative Chinese text and a reference English translation, rendered
// clause by clause on /legal/*. Source draft: ../../../LEGAL.md (revised to match the features the
// site actually has). The texts live in code rather than R2 on purpose: the pages must be static and
// indexable, and they describe data flows that change together with the code (see README §7).
// When a feature changes what data is handled, update this file and LEGAL.updated in the same commit.

export interface LegalText { zh: string; en: string }
export interface LegalItem extends LegalText { label: string }
export interface LegalClause extends LegalText { no: string; id: string; items: LegalItem[] }
export interface LegalArticle { no: number; id: string; title: LegalText; clauses: LegalClause[] }
export type LegalSlug = 'terms' | 'privacy' | 'disclaimer' | 'notices';
export interface LegalDocument { slug: LegalSlug; code: string; title: LegalText; summary: LegalText; articles: LegalArticle[] }

export const LEGAL = {
  effective: '2026-10-13',
  updated: '2026-10-21',
  email: '3043927908@qq.com',
  site: 'https://icaiming.cn',
  copyrightStart: 2026,
  operator: { zh: 'IC Aiming 站长（个人开发者）', en: 'the webmaster of IC Aiming (an individual developer)' },
} as const;

const year = new Date().getFullYear();
export const COPYRIGHT_YEARS = year > LEGAL.copyrightStart ? `${LEGAL.copyrightStart}–${year}` : String(LEGAL.copyrightStart);

// Inline markup used inside clause texts: `code`, **bold**, [label](href). See renderInline().
const MAIL = `[${LEGAL.email}](mailto:${LEGAL.email})`;
const code = (value: string) => '`' + value + '`';

// ---------------------------------------------------------------------------------------------
// Authoring helpers. Clause numbers (1.1), item labels ((a)) and anchors are generated, so texts
// can be reordered without renumbering by hand.
type ItemSource = [zh: string, en: string];
interface ClauseSource { zh: string; en: string; items?: ItemSource[] }
interface ArticleSource { title: LegalText; clauses: ClauseSource[] }
const clause = (zh: string, en: string, items?: ItemSource[]): ClauseSource => ({ zh, en, items });
const article = (zh: string, en: string, ...clauses: ClauseSource[]): ArticleSource => ({ title: { zh, en }, clauses });

function build(slug: LegalSlug, letter: string, title: LegalText, summary: LegalText, articles: ArticleSource[]): LegalDocument {
  return {
    slug, code: letter, title, summary,
    articles: articles.map((source, a) => ({
      no: a + 1,
      id: `article-${a + 1}`,
      title: source.title,
      clauses: source.clauses.map((entry, c) => ({
        no: `${a + 1}.${c + 1}`,
        id: `clause-${a + 1}-${c + 1}`,
        zh: entry.zh,
        en: entry.en,
        items: (entry.items ?? []).map(([zh, en], i) => ({ label: `(${String.fromCharCode(97 + i)})`, zh, en })),
      })),
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// A. 用户协议 / Terms of Service
const terms = build('terms', 'A',
  { zh: '用户协议', en: 'Terms of Service' },
  {
    zh: '访问和使用本站的规则：服务范围、行为规范、知识产权、责任限制与争议解决。',
    en: 'The rules for visiting and using the Site: scope of service, acceptable use, intellectual property, limitation of liability and dispute resolution.',
  },
  [
    article('总则与协议接受', 'General Provisions and Acceptance',
      clause(
        '本协议是您与 IC Aiming 网站（域名：icaiming.cn，以下简称“本站”）的运营者 IC Aiming 站长（个人开发者，以下简称“运营者”或“我们”）之间，就您访问和使用本站所订立的协议。',
        'These Terms of Service (the “Terms”) are an agreement between you and the webmaster of IC Aiming, an individual developer (the “Operator”, “we” or “us”), who operates the IC Aiming website at icaiming.cn (the “Site”). They govern your access to and use of the Site.'),
      clause(
        '本站为个人非商业性质站点，由个人开发者独立运营，不涉及商品交易、付费服务、广告投放或其他经营性活动。',
        'The Site is a personal, non-commercial website run independently by an individual developer. It does not sell goods, offer paid services, serve advertising or carry out any other commercial activity.'),
      clause(
        '您访问、浏览或以其他方式使用本站，即视为您已阅读、理解并同意接受本协议全部条款的约束。若您不同意本协议的任何内容，请立即停止使用本站。',
        'By accessing, browsing or otherwise using the Site, you confirm that you have read, understood and agree to be bound by all of these Terms. If you do not agree with any part of them, please stop using the Site immediately.'),
      clause(
        '我们可能不时修订本协议。修订后的协议自在本站公布之日起生效，并同步更新页面顶部的“最后更新”日期。您在修订生效后继续使用本站，即视为接受修订后的协议。',
        'We may revise these Terms from time to time. A revised version takes effect on the date it is published on the Site, and the “Last updated” date at the top of the page is changed accordingly. If you continue to use the Site after a revision takes effect, you accept the revised Terms.'),
      clause(
        '[《隐私政策》](/legal/privacy)、[《免责声明》](/legal/disclaimer)与[《其他声明》](/legal/notices)是本协议的组成部分，与本协议具有同等效力。',
        'The [Privacy Policy](/legal/privacy), the [Disclaimer](/legal/disclaimer) and the [Other Statements](/legal/notices) form part of these Terms and have the same effect.'),
    ),
    article('服务说明', 'Description of the Service',
      clause('本站提供的内容与服务包括但不限于：', 'The content and services provided by the Site include, without limitation:', [
        ['运营者撰写或整理的原创内容，例如文章、个人资料与履历、项目介绍；',
          'original content written or compiled by the Operator, such as articles, profile and résumé information, and project descriptions;'],
        ['运营者手动整理的收藏链接与资源下载；',
          'bookmarked links and downloadable resources curated by the Operator;'],
        ['聚合展示来自第三方公开来源的数据，例如 GitHub 开源项目趋势、各平台热榜、限时免费游戏信息、每日新闻图与随机语句（一言）；',
          'aggregated data from third-party public sources, such as GitHub open-source trends, trending lists from various platforms, limited-time free game offers, a daily news image and random quotes;'],
        ['互动实验，例如“聚焦练习”小游戏与“答案之书”；',
          'interactive experiments, such as the “Focus Drill” mini-game and the “Answer Book”;'],
        ['本站文章的 RSS 订阅源。',
          'an RSS feed of the Site’s articles.'],
      ]),
      clause(
        '本站前端部署于 Cloudflare Pages，动态内容存储于 Cloudflare R2，外部数据由 Cloudflare Workers 定时抓取并缓存，部分功能由 Cloudflare Pages Functions 在服务端实时处理。本站服务的可用性依赖上述第三方基础设施，我们不对其作出任何保证。',
        'The Site’s front end is hosted on Cloudflare Pages, its dynamic content is stored in Cloudflare R2, external data is fetched and cached on a schedule by Cloudflare Workers, and some features are processed server-side in real time by Cloudflare Pages Functions. The availability of the Site depends on this third-party infrastructure, and we make no guarantee about it.'),
      clause(
        '本站不设用户账号，您无需注册或登录即可浏览全部公开内容。本站目前不提供评论、邮件订阅或付费功能。',
        'The Site has no user accounts; you can browse all public content without registering or signing in. The Site currently offers no comments, email subscriptions or paid features.'),
      clause(
        '本站有权随时增加、修改、暂停或终止任一功能或全部服务，无需事先通知，亦无需对您或任何第三方承担赔偿责任。',
        'We may add, modify, suspend or discontinue any feature or the entire service at any time without prior notice and without liability to you or any third party.'),
    ),
    article('用户行为规范', 'Acceptable Use',
      clause(
        '您承诺在使用本站时遵守中华人民共和国法律法规以及您所在司法辖区的适用法律，不得利用本站从事任何违法或侵权活动。',
        'You agree to comply with the laws and regulations of the People’s Republic of China and the laws applicable in your jurisdiction when using the Site, and not to use the Site for any unlawful or infringing activity.'),
      clause('未经我们事先书面许可，您不得实施以下行为：', 'Unless we have given prior written permission, you must not:', [
        [`使用自动化程序、爬虫、脚本或机器人，以超出正常浏览的频率或规模批量抓取、复制、镜像或下载本站内容，或绕过页面直接批量调用本站 ${code('/api/')} 数据接口；遵守本站 robots.txt 的搜索引擎及 AI 检索类访问除外，具体规则见[《其他声明》第二条](/legal/notices#article-2)；`,
          `use automated programs, crawlers, scripts or bots to scrape, copy, mirror or download the Site’s content in bulk at a rate or scale beyond normal browsing, or call the Site’s ${code('/api/')} data endpoints directly in bulk, bypassing its pages. Search-engine and AI-search access that complies with the Site’s robots.txt is excepted, as described in [Article 2 of the Other Statements](/legal/notices#article-2);`],
        ['对本站或其依赖的基础设施实施扫描、渗透测试、拒绝服务攻击（DoS/DDoS）或其他干扰、破坏、入侵行为；',
          'scan or penetration-test the Site or the infrastructure it relies on, launch denial-of-service (DoS/DDoS) attacks against them, or otherwise interfere with, disrupt or intrude into them;'],
        ['绕过、破解或干扰本站的任何安全措施、访问控制、速率限制或反爬机制；',
          'bypass, break or interfere with any security measure, access control, rate limit or anti-scraping mechanism of the Site;'],
        ['将本站内容用于训练、微调人工智能或机器学习模型，或用于构建训练数据集或与本站实质相似的竞争性数据集；',
          'use the Site’s content to train or fine-tune artificial-intelligence or machine-learning models, or to build training datasets or competing datasets substantially similar to the Site;'],
        ['在“答案之书”等输入框中提交违法、侵权、骚扰性内容，或他人的个人信息；',
          'submit unlawful, infringing or harassing content, or other people’s personal information, through input fields such as the Answer Book;'],
        ['以任何方式冒充本站、运营者或关联方身份；',
          'impersonate the Site, the Operator or any affiliated party in any way;'],
        ['实施其他损害本站、运营者或任何第三方合法权益的行为。',
          'do anything else that harms the lawful rights and interests of the Site, the Operator or any third party.'],
      ]),
      clause(
        '如您违反本协议，我们有权视情节采取包括但不限于限制访问、封禁 IP 地址、删除相关内容等措施，并保留依法追究您法律责任的权利。',
        'If you breach these Terms, we may, depending on the circumstances, take measures including restricting access, blocking IP addresses and removing related content, and we reserve the right to pursue legal liability in accordance with the law.'),
    ),
    article('互动功能与邮件订阅', 'Interactive Features and Email Subscriptions',
      clause(
        '“答案之书”会将您输入的问题（不超过 100 字）经本站服务端转发至第三方接口 UAPI（uapis.cn），以获取一条随机答案。本站不保存您的问题，转发请求不附带您的 IP 地址或浏览器信息，详见[《隐私政策》](/legal/privacy#article-3)。',
        'The Answer Book forwards the question you enter (up to 100 characters) through the Site’s server to UAPI (uapis.cn), a third-party API, to obtain a random answer. The Site does not store your question, and the forwarded request does not include your IP address or browser information. See the [Privacy Policy](/legal/privacy#article-3) for details.'),
      clause(
        '“答案之书”的答案由第三方随机返回，仅供娱乐，不构成任何建议或预测。请勿在输入框中填写您或他人的个人信息、敏感信息。',
        'Answer Book answers are returned at random by a third party, are for entertainment only and are not advice or a prediction of any kind. Do not enter your own or anyone else’s personal or sensitive information in the input field.'),
      clause(
        '“聚焦练习”等小游戏的成绩及您的外观偏好仅保存在您的浏览器本地，本站服务器不接收、不保存。',
        'Scores from mini-games such as the Focus Drill, and your appearance preferences, are stored only in your browser; the Site’s servers neither receive nor keep them.'),
      clause(
        '本站目前不提供邮件订阅，也不收集邮箱地址。如未来上线订阅功能，将遵循自愿原则，每封邮件均附退订方式，相关个人信息处理规则将在上线前写入《隐私政策》并在本站公告。',
        'The Site does not currently offer email subscriptions or collect email addresses. If a subscription feature is introduced, it will be voluntary, every email will include a way to unsubscribe, and the related personal-information rules will be added to the Privacy Policy and announced on the Site before launch.'),
      clause(
        '订阅功能上线后，请勿使用他人邮箱地址订阅。因使用未经授权的邮箱地址订阅所引发的纠纷，由订阅者自行承担相应责任。',
        'Once subscriptions are available, do not subscribe with someone else’s email address. Any dispute arising from subscribing with an unauthorized email address is the subscriber’s own responsibility.'),
    ),
    article('知识产权', 'Intellectual Property',
      clause(
        '本站的原创内容，包括但不限于文字、页面设计、图表、品牌标识、运营者整理汇编的收藏列表及原创标题描述，其知识产权归运营者所有，受法律保护。',
        'Intellectual property in the Site’s original content, including without limitation text, page design, graphics, brand marks, the bookmark lists compiled by the Operator, and original titles and descriptions, belongs to the Operator and is protected by law.'),
      clause(
        '本站聚合展示的第三方数据、热榜、图片及其中涉及的商标、标识、Logo 等，其知识产权归各自权利人所有。本站仅以信息聚合、索引和展示为目的使用，不代表本站拥有相关权利，也不代表数据来源方与本站存在关联或背书关系。',
        'Intellectual property in third-party data, trending lists and images aggregated on the Site, including any trademarks, marks and logos they contain, belongs to the respective rights holders. The Site uses them only for aggregation, indexing and display; this does not mean the Site owns those rights, or that any data source is affiliated with or endorses the Site.'),
      clause(
        `如权利人认为本站展示的内容侵犯其合法权益，请按[《其他声明》第六条](/legal/notices#article-6)的流程，通过 ${MAIL} 与我们联系。我们将及时核实，并在确认后采取删除内容、断开链接等必要措施。`,
        `If a rights holder believes that content displayed on the Site infringes their lawful rights, please contact us at ${MAIL} following the procedure in [Article 6 of the Other Statements](/legal/notices#article-6). We will verify the claim promptly and, once it is confirmed, take necessary measures such as removing the content or disabling the link.`),
      clause(
        '未经我们许可，任何组织或个人不得转载、复制、修改、传播本站原创内容。合理引用应注明出处并链接至原文页面。',
        'No organization or individual may republish, copy, modify or distribute the Site’s original content without our permission. Fair quotation must credit the source and link to the original page.'),
    ),
    article('免责声明', 'Disclaimer',
      clause(
        '本站内容仅供参考与学习交流，不构成任何专业意见。详细免责事项见[《免责声明》](/legal/disclaimer)。',
        'The Site’s content is provided for reference, learning and exchange only and is not professional advice of any kind. See the [Disclaimer](/legal/disclaimer) for details.'),
      clause(
        '本站聚合的第三方数据可能存在延迟、中断、错误、遗漏或其他不准确情形，我们不对其准确性、及时性、完整性或适用性作任何明示或默示的保证。',
        'Third-party data aggregated on the Site may be delayed, interrupted, erroneous, incomplete or otherwise inaccurate. We make no express or implied warranty as to its accuracy, timeliness, completeness or fitness for any purpose.'),
      clause(
        '本站展示的热榜、开源趋势、限免信息等仅反映相关第三方数据来源的统计方法与内容，不代表本站观点，不构成投资、法律、医疗或任何其他专业建议。',
        'Trending lists, open-source trends, free-game offers and similar information shown on the Site reflect only the methods and content of the relevant third-party sources. They do not represent the Site’s views and are not investment, legal, medical or any other professional advice.'),
      clause(
        '在适用法律允许的最大范围内，本站及运营者不对您因使用或无法使用本站而产生的任何直接、间接、附带、特殊或惩罚性损害承担责任，但依照适用法律不得免除的责任除外。',
        'To the maximum extent permitted by applicable law, neither the Site nor the Operator is liable for any direct, indirect, incidental, special or punitive damages arising from your use of, or inability to use, the Site, except for liability that cannot be excluded under applicable law.'),
    ),
    article('服务变更、中断与终止', 'Changes, Interruption and Termination of Service',
      clause(
        '我们保留随时变更、暂停或终止全部或部分服务的权利，且无需事先通知。',
        'We reserve the right to change, suspend or terminate all or part of the service at any time without prior notice.'),
      clause(
        '因不可抗力、网络故障、第三方服务中断、域名或政策调整等本站无法合理控制的原因导致服务中断、数据延迟或丢失的，本站不承担责任。',
        'The Site is not liable for service interruptions, data delays or data loss caused by circumstances beyond its reasonable control, such as force majeure, network failures, third-party service outages, or changes to domain names or policies.'),
      clause(
        '本协议终止后，第五条（知识产权）、第六条（免责声明）、第九条（适用法律与争议解决）及其他依其性质应当继续有效的条款继续有效。',
        'After these Terms terminate, Article 5 (Intellectual Property), Article 6 (Disclaimer), Article 9 (Governing Law and Dispute Resolution) and any other provisions that by their nature should survive remain in effect.'),
    ),
    article('通知与送达', 'Notices',
      clause(
        '本站可通过网站公告、更新相关页面或其他合理方式向您发送通知，该等通知自在本站发布之日视为送达。',
        'The Site may give you notice through announcements on the Site, by updating the relevant page or by other reasonable means. Such notices are deemed delivered on the date they are published on the Site.'),
      clause(
        `您可以通过 ${MAIL} 向我们发送通知。`,
        `You may send notices to us at ${MAIL}.`),
    ),
    article('适用法律与争议解决', 'Governing Law and Dispute Resolution',
      clause(
        '本协议的订立、效力、解释、履行及争议解决均适用中华人民共和国法律（不含冲突法规则）。',
        'The formation, validity, interpretation and performance of these Terms, and the resolution of disputes under them, are governed by the laws of the People’s Republic of China, excluding its conflict-of-laws rules.'),
      clause(
        '因本协议或使用本站产生的争议，双方应首先友好协商解决；协商不成的，任何一方可向运营者住所地有管辖权的人民法院提起诉讼。',
        'Any dispute arising from these Terms or your use of the Site shall first be resolved through friendly negotiation. If negotiation fails, either party may bring a lawsuit before the competent people’s court at the Operator’s place of domicile.'),
    ),
    article('其他', 'Miscellaneous',
      clause(
        '本协议任一条款被认定为无效或不可执行的，不影响其他条款的效力。',
        'If any provision of these Terms is held invalid or unenforceable, the remaining provisions remain in effect.'),
      clause(
        '本协议未尽事宜，参照本站其他法律文件及适用法律法规处理。',
        'Matters not covered by these Terms are handled in accordance with the Site’s other legal documents and applicable laws and regulations.'),
      clause(
        '本协议以中文撰写，英文译本仅供参考；两者不一致时，以中文版本为准。',
        'These Terms are written in Chinese. The English translation is for reference only; if the two versions differ, the Chinese version prevails.'),
    ),
  ]);

// ---------------------------------------------------------------------------------------------
// B. 隐私政策 / Privacy Policy
const privacy = build('privacy', 'B',
  { zh: '隐私政策', en: 'Privacy Policy' },
  {
    zh: '我们处理哪些个人信息、为什么处理、保存在哪里、与谁共享，以及您享有的权利。',
    en: 'What personal information we handle and why, where it is stored, who it is shared with, and the rights you have.',
  },
  [
    article('引言与适用范围', 'Introduction and Scope',
      clause(
        '本政策说明 IC Aiming（icaiming.cn，以下称“本站”）如何收集、使用、存储、共享和保护您的个人信息，以及您享有的相关权利。',
        'This Policy explains how IC Aiming (icaiming.cn, the “Site”) collects, uses, stores, shares and protects your personal information, and the rights you have in relation to it.'),
      clause(
        '我们将按照《中华人民共和国个人信息保护法》《中华人民共和国网络安全法》《中华人民共和国数据安全法》以及（在适用情况下）欧盟《通用数据保护条例》（GDPR）等适用法律法规的要求处理个人信息。',
        'We handle personal information in accordance with applicable laws and regulations, including the Personal Information Protection Law (PIPL), the Cybersecurity Law and the Data Security Law of the People’s Republic of China and, where applicable, the EU General Data Protection Regulation (GDPR).'),
      clause(
        '本站遵循最小必要原则：浏览本站无需提供任何个人信息，我们只处理本政策列明的信息。',
        'The Site follows the principle of data minimization: you do not need to provide any personal information to browse the Site, and we handle only the information listed in this Policy.'),
      clause(
        '对于 GDPR 适用范围内的数据主体，本政策中关于法律依据、跨境传输及权利的条款同时适用。',
        'For data subjects within the scope of the GDPR, the provisions of this Policy on legal bases, international transfers and rights also apply.'),
    ),
    article('个人信息处理者与联系方式', 'Controller and Contact Details',
      clause(
        '个人信息处理者（数据控制者）：IC Aiming 站长（个人开发者）。',
        'Personal information handler (data controller): the webmaster of IC Aiming (an individual developer).'),
      clause(
        `联系邮箱：${MAIL}。个人信息相关事务请在邮件标题中注明“隐私”。`,
        `Contact email: ${MAIL}. For privacy matters, please include “Privacy” in the subject line.`),
      clause(
        '欧盟代表（GDPR 第 27 条）：暂不适用。本站主要面向中文读者，未在欧盟设立机构，也未专门向欧盟境内的个人提供商品或服务。',
        'EU representative (GDPR Article 27): not applicable at present. The Site is aimed mainly at Chinese-speaking readers, has no establishment in the EU and does not specifically offer goods or services to individuals in the EU.'),
    ),
    article('我们处理的个人信息', 'Personal Information We Handle',
      clause(
        '**服务器日志信息**：您访问本站时，托管与网络服务商 Cloudflare 会自动记录 IP 地址、User-Agent（浏览器与设备信息）、访问时间、请求路径（含查询参数）、响应状态等技术日志，用于安全防护、防止滥用与故障排查。运营者本身不另行建立访问日志。',
        '**Server log information**: when you visit the Site, our hosting and network provider Cloudflare automatically records technical logs such as your IP address, User-Agent (browser and device information), time of access, requested path (including query parameters) and response status. These are used for security, abuse prevention and troubleshooting. The Operator does not keep a separate access log.'),
      clause(
        '**“答案之书”输入内容**：您主动输入的问题文本会经本站服务端实时转发至 UAPI（uapis.cn）以获取答案。本站不存储该文本，转发请求不附带您的 IP 地址或浏览器信息；但由于问题以请求参数形式传输，可能出现在第 3.1 条所述的服务器日志中。该文本通常不构成个人信息，请勿在其中填写任何个人信息。',
        '**Answer Book input**: the question text you choose to enter is forwarded in real time through the Site’s server to UAPI (uapis.cn) to obtain an answer. The Site does not store this text, and the forwarded request does not include your IP address or browser information. Because the question is sent as a request parameter, however, it may appear in the server logs described in clause 3.1. The text is normally not personal information; please do not include any personal information in it.'),
      clause(
        '**浏览器本地存储**：为记住您的选择，本站会在您的浏览器中保存外观偏好（皮肤、色彩模式、动画开关）、“聚焦练习”最佳成绩及开屏动画是否已播放等少量数据（详见[第八条](#article-8)）。这些数据仅保存在您的设备上，不会发送至本站服务器。',
        '**Browser storage**: to remember your choices, the Site saves a small amount of data in your browser, such as appearance preferences (skin, color mode and animation setting), your Focus Drill best score and whether the intro animation has played (see [Article 8](#article-8)). This data stays on your device and is never sent to the Site’s servers.'),
      clause(
        '**电子邮件往来**：如您主动发送电子邮件联系我们，我们会获得您的邮箱地址及您在邮件中提供的信息，仅用于回复和处理您的请求。',
        '**Email correspondence**: if you choose to email us, we receive your email address and whatever information you include in the message, which we use only to reply to and handle your request.'),
      clause(
        '**访问统计**：除 Cloudflare 基于服务器日志自动生成的汇总流量数据外，本站目前未启用任何访问统计或分析工具。如未来启用（例如 Cloudflare Web Analytics 等无 Cookie 的匿名统计），我们将事先更新本政策。',
        '**Analytics**: apart from the aggregate traffic figures Cloudflare generates automatically from server logs, the Site does not currently use any analytics tools. If we enable one in the future (for example a cookie-free, anonymous service such as Cloudflare Web Analytics), we will update this Policy beforehand.'),
      clause(
        '**邮件订阅**：本站目前不提供邮件订阅，不收集订阅邮箱。如未来上线，将在上线前更新本政策。',
        '**Email subscriptions**: the Site does not currently offer email subscriptions and does not collect subscriber addresses. If such a feature is introduced, we will update this Policy before launch.'),
      clause(
        '本站不建立用户账号系统，不收集您的姓名、手机号、身份证件号码、支付信息、精确位置等个人身份信息，也不收集任何敏感个人信息（包括生物识别、宗教信仰、特定身份、医疗健康、金融账户、行踪轨迹等）。',
        'The Site has no user-account system and does not collect your name, phone number, ID number, payment details, precise location or other identifying information. Nor does it collect any sensitive personal information (such as biometric data, religious beliefs, specific identities, medical and health data, financial accounts or whereabouts).'),
    ),
    article('处理目的与法律依据', 'Purposes and Legal Bases',
      clause(
        '**服务器日志**：处理目的为保障服务安全、防止攻击与滥用、排查故障；法律依据为履行法定义务（如在适用范围内《网络安全法》关于网络日志留存的要求，《个人信息保护法》第十三条第一款第三项），以及我们维护服务安全稳定运行的合法利益（GDPR 第 6(1)(f) 条）。',
        '**Server logs**: processed to keep the service secure, prevent attacks and abuse, and troubleshoot faults. Legal bases: compliance with legal obligations, such as the network-log retention requirements of the Cybersecurity Law where applicable (PIPL Article 13(1)(3)), and our legitimate interest in keeping the service secure and stable (GDPR Article 6(1)(f)).'),
      clause(
        '**“答案之书”输入内容**：处理目的为按您的请求返回答案；如其中包含个人信息，法律依据为提供您所请求的功能所必需（《个人信息保护法》第十三条第一款第二项；GDPR 第 6(1)(b) 条）。',
        '**Answer Book input**: processed to return an answer at your request. To the extent it contains personal information, the legal basis is that processing is necessary to provide the feature you requested (PIPL Article 13(1)(2); GDPR Article 6(1)(b)).'),
      clause(
        '**电子邮件往来**：处理目的为回复和处理您的咨询、投诉或权利请求；法律依据为您主动联系时作出的同意（《个人信息保护法》第十三条第一款第一项）以及我们回应来信的合法利益（GDPR 第 6(1)(f) 条）；涉及权利请求时，亦为履行法定义务所必需。',
        '**Email correspondence**: processed to reply to and handle your enquiries, complaints or rights requests. Legal bases: the consent you give by contacting us (PIPL Article 13(1)(1)) and our legitimate interest in responding to messages (GDPR Article 6(1)(f)); for rights requests, processing is also necessary to comply with legal obligations.'),
      clause(
        '**浏览器本地存储**：仅用于实现您主动选择的显示偏好与游戏记录功能，属于提供相应功能所严格必需的存储，数据不离开您的设备。',
        '**Browser storage**: used solely to provide the display preferences and game records you choose, and strictly necessary for those features. The data never leaves your device.'),
      clause(
        '如未来上线邮件订阅，相关处理将以您的**同意**为法律依据（《个人信息保护法》第十三条第一款第一项；GDPR 第 6(1)(a) 条）。您可以随时撤回同意（退订），撤回同意不影响撤回前基于同意已进行的处理的合法性。',
        'If email subscriptions are introduced, the related processing will be based on your **consent** (PIPL Article 13(1)(1); GDPR Article 6(1)(a)). You may withdraw consent (unsubscribe) at any time; withdrawal does not affect the lawfulness of processing carried out before it.'),
    ),
    article('存储位置、跨境传输与保留期限', 'Storage Location, Cross-border Transfers and Retention',
      clause(
        '本站使用 Cloudflare 全球网络提供服务，您的数据可能在您所在国家或地区以外的服务器上被处理和存储（包括但不限于美国、欧盟等司法辖区）。',
        'The Site is served over Cloudflare’s global network, so your data may be processed and stored on servers outside your country or region (including, without limitation, the United States and the EU).'),
      clause(
        '您从中国境内访问本站时，服务器日志信息将由境外接收方 Cloudflare, Inc. 处理。境外接收方的名称、联系方式、处理目的与方式及个人信息种类见[第六条](#article-6)，您可按[第七条](#article-7)所列方式向我们或境外接收方行使权利。我们将依据《个人信息保护法》第三十八条、第三十九条及《促进和规范数据跨境流动规定》等规定，持续评估并履行相应的合规义务。',
        'When you access the Site from mainland China, server log information is processed by an overseas recipient, Cloudflare, Inc. The recipient’s name, contact details, processing purposes and methods, and the types of personal information involved are set out in [Article 6](#article-6), and you may exercise your rights against us or the overseas recipient as described in [Article 7](#article-7). We will keep assessing and fulfilling the corresponding compliance obligations under Articles 38 and 39 of the PIPL, the Provisions on Promoting and Regulating Cross-border Data Flows and other applicable rules.'),
      clause(
        '在 GDPR 适用场景下的跨境传输，我们依托 Cloudflare 在其数据处理附录（DPA）中提供的标准合同条款（SCCs）等适当保障机制进行。',
        'For international transfers subject to the GDPR, we rely on appropriate safeguards such as the Standard Contractual Clauses (SCCs) included in Cloudflare’s Data Processing Addendum (DPA).'),
      clause('**保留期限**：', '**Retention periods**:', [
        ['**服务器日志**：运营者不另行留存；Cloudflare 按其相应服务的日志策略保存，保留期限以其政策为准。',
          '**Server logs**: not kept separately by the Operator. Cloudflare keeps them under the log policies of its relevant services, and its policies determine the retention period.'],
        ['**“答案之书”输入内容**：本站在返回答案后即不再保留；第三方接口一侧的保留规则以其自身政策为准。',
          '**Answer Book input**: the Site keeps nothing once the answer has been returned; any retention on the third-party API’s side is governed by its own policies.'],
        ['**电子邮件往来**：仅在处理您的请求所必需的期限内保留；处理完毕后，您可随时要求删除。',
          '**Email correspondence**: kept only as long as necessary to handle your request; once it has been handled, you may ask us to delete it at any time.'],
        ['**浏览器本地存储**：由您自行控制，可随时通过浏览器清除本站的站点数据。',
          '**Browser storage**: under your control; you can clear the Site’s data in your browser at any time.'],
        ['**订阅邮箱（如未来提供）**：保留至您退订；退订后 30 日内从订阅列表中删除，备份中的副本随备份轮换周期清除。',
          '**Subscriber email addresses (if introduced)**: kept until you unsubscribe, then removed from the subscriber list within 30 days; copies in backups are purged as the backups rotate.'],
      ]),
      clause(
        '如您希望通过邮件联系我们，同时减少个人信息暴露，可以使用别名邮箱地址。',
        'If you want to email us while limiting how much personal information you share, you may use an alias email address.'),
    ),
    article('第三方服务与共享', 'Third-party Services and Sharing',
      clause(
        '我们**不会出售、出租**您的个人信息，也不会为商业目的共享您的个人信息。',
        'We do **not sell or rent** your personal information, and we do not share it for commercial purposes.'),
      clause('为运营本站，我们使用以下第三方服务：', 'To run the Site we use the following third-party services:', [
        ['**Cloudflare, Inc.**（地址：101 Townsend St, San Francisco, CA 94107, USA；隐私联系：[privacyquestions@cloudflare.com](mailto:privacyquestions@cloudflare.com)）：提供 CDN、页面托管（Pages / Pages Functions）、对象存储（R2）、Workers 及安全防护等服务，处理服务器日志信息与经本站传输的请求内容，数据可能在其全球网络中被处理。隐私规则见 [Cloudflare 隐私政策](https://www.cloudflare.com/privacypolicy/)。',
          '**Cloudflare, Inc.** (101 Townsend St, San Francisco, CA 94107, USA; privacy contact: [privacyquestions@cloudflare.com](mailto:privacyquestions@cloudflare.com)): provides CDN, page hosting (Pages / Pages Functions), object storage (R2), Workers and security services. It processes server log information and the content of requests passing through the Site, potentially anywhere in its global network. See the [Cloudflare Privacy Policy](https://www.cloudflare.com/privacypolicy/).'],
        ['**UAPI**（[uapis.cn](https://uapis.cn)）：提供“答案之书”接口，接收经本站服务端转发的问题文本（不含您的 IP 地址或浏览器信息）。本站亦通过其公开接口获取热榜、限免游戏、每日新闻图与一言等公共数据，该过程不涉及您的个人信息。',
          '**UAPI** ([uapis.cn](https://uapis.cn)): provides the Answer Book API and receives the question text forwarded by the Site’s server (without your IP address or browser information). The Site also uses its public APIs to obtain public data such as trending lists, free-game offers, the daily news image and quotes; this involves none of your personal information.'],
        ['**GitHub**：本站服务端定时读取 GitHub Trending 公开页面以生成开源趋势榜，该过程不涉及您的个人信息。',
          '**GitHub**: the Site’s server periodically reads the public GitHub Trending page to build the open-source trends list; this involves none of your personal information.'],
      ]),
      clause(
        '**由您的浏览器直接加载的第三方资源**：“每日”页面中限时免费游戏的封面图由您的浏览器直接从第三方图片服务器加载，该服务器可能因此获得您的 IP 地址、浏览器信息与访问时间。除此之外，本站不加载任何第三方字体、广告或追踪脚本。',
        '**Third-party resources loaded directly by your browser**: cover images for the free games on the Daily page are loaded by your browser directly from third-party image servers, which may therefore receive your IP address, browser information and time of access. Beyond this, the Site loads no third-party fonts, ads or tracking scripts.'),
      clause(
        '当您点击本站的外部链接（如收藏、热榜条目、社交账号）离开本站后，您的访问将适用目标网站的隐私规则，不由本站负责。',
        'When you follow an external link on the Site (such as a bookmark, a trending item or a social profile) and leave the Site, the destination site’s privacy rules apply, and the Site is not responsible for them.'),
      clause(
        '上述服务商仅在提供相应服务所必需的范围内处理数据，相关数据处理关系依据其公开的服务条款、隐私政策及（如有）数据处理协议（DPA）约定。',
        'These providers process data only to the extent necessary to provide their services, and the data-processing relationship is governed by their published terms of service, privacy policies and, where available, data processing agreements (DPAs).'),
      clause(
        '除法律法规要求、有权机关依法定程序要求或取得您的另行同意外，我们不会向任何第三方披露您的个人信息。',
        'Except where required by laws and regulations, requested by competent authorities through legal procedures, or with your separate consent, we will not disclose your personal information to any third party.'),
    ),
    article('您的权利', 'Your Rights',
      clause('在适用法律规定的范围内，您对自己的个人信息享有以下权利：', 'Within the scope of applicable law, you have the following rights in relation to your personal information:', [
        ['知情权与决定权；', 'the right to be informed and to decide;'],
        ['查阅、复制您的个人信息，并在符合规定条件时请求将其转移至您指定的个人信息处理者；',
          'the right to access and obtain a copy of your personal information and, where the conditions set by regulators are met, to request its transfer to another handler you designate;'],
        ['更正、补充不准确或不完整的个人信息；', 'the right to correct or supplement inaccurate or incomplete information;'],
        ['删除个人信息；', 'the right to have your personal information deleted;'],
        ['撤回同意；', 'the right to withdraw consent;'],
        ['要求对个人信息处理规则进行解释说明；', 'the right to request an explanation of our rules for handling personal information;'],
        ['本站不设账号，无需注销；如未来提供邮件订阅，退订即可删除订阅记录；',
          'the Site has no accounts, so there is nothing to close; if email subscriptions are introduced, unsubscribing deletes your subscription record;'],
        ['GDPR 适用情形下的额外权利：限制处理、数据可携带、反对处理，以及向监管机构投诉。',
          'where the GDPR applies, the additional rights to restrict processing, to data portability, to object to processing and to lodge a complaint with a supervisory authority.'],
      ]),
      clause(
        `**行使方式**：请发送邮件至 ${MAIL}。我们将在法定期限内予以回应（一般不超过 15 个工作日；GDPR 适用情形下为 1 个月）。为保障安全，我们可能需要您提供必要信息以核实请求。`,
        `**How to exercise your rights**: email us at ${MAIL}. We will respond within the statutory time limit (generally no more than 15 working days, or one month where the GDPR applies). For security reasons, we may ask for information needed to verify your request.`),
      clause(
        '由于本站不设账号、运营者不另行留存访问日志，对于仅存在于 Cloudflare 服务器日志中的信息，我们可能无法识别与您对应的记录；必要时，我们会协助您向 Cloudflare 提出请求。',
        'Because the Site has no accounts and the Operator keeps no separate access log, we may be unable to identify records relating to you that exist only in Cloudflare’s server logs. Where necessary, we will help you submit your request to Cloudflare.'),
      clause(
        '保存在您浏览器中的本地数据，可由您通过浏览器设置随时查看和清除。',
        'You can view and clear the data stored in your browser at any time through your browser settings.'),
      clause(
        '您有权向所在地个人信息保护监管机构（如中国国家网信部门）或（如适用）欧盟成员国数据保护监管机构投诉举报。',
        'You have the right to lodge a complaint with your local personal-information protection authority (such as the Cyberspace Administration of China) or, where applicable, a data protection supervisory authority in an EU member state.'),
    ),
    article('Cookie 与同类技术', 'Cookies and Similar Technologies',
      clause(
        '本站自身不设置任何 Cookie，不使用用于广告追踪、访问统计或跨站画像的 Cookie。',
        'The Site itself sets no cookies, and uses no cookies for advertising, analytics or cross-site profiling.'),
      clause(
        `Cloudflare 的安全防护机制可能设置必要的功能性 Cookie（如 ${code('__cf_bm')}、${code('cf_clearance')}，用于区分真人用户与自动化程序），该等 Cookie 为服务安全运行所必需。`,
        `Cloudflare’s security mechanisms may set strictly necessary cookies (such as ${code('__cf_bm')} and ${code('cf_clearance')}, which help distinguish human visitors from automated programs). These cookies are required for the service to run securely.`),
      clause('本站使用浏览器本地存储（localStorage / sessionStorage）保存以下数据，仅在您的设备上读取，不随请求发送至服务器：', 'The Site uses browser storage (localStorage / sessionStorage) for the following data, which is read only on your device and is not sent to the server with requests:', [
        [`${code('theme')}、${code('colorMode')}、${code('motion')}（localStorage）：外观皮肤、色彩模式与动画开关偏好；`,
          `${code('theme')}, ${code('colorMode')} and ${code('motion')} (localStorage): your appearance skin, color mode and animation preferences;`],
        [`${code('focus-best')}（localStorage）：“聚焦练习”的最佳成绩；`,
          `${code('focus-best')} (localStorage): your best Focus Drill score;`],
        [`${code('ic-intro')}（sessionStorage）：本次会话中开屏动画是否已播放，关闭标签页后自动清除。`,
          `${code('ic-intro')} (sessionStorage): whether the intro animation has played in this session; cleared automatically when you close the tab.`],
        [`${code('site-pet-visibility')}（localStorage）：站宠显示偏好；${code('site-pet-session')}（sessionStorage）：本标签页的固定动画候选池、可选请求预算、失败次数与冷却时间，关闭标签页后清除。站宠动画按需从本站本地媒体路由或配置的媒体资源域加载；请求可能包含 IP 地址、浏览器信息及访问时间，但不发送上述存储值。`,
          `${code('site-pet-visibility')} (localStorage): pet visibility preference; ${code('site-pet-session')} (sessionStorage): the tab’s fixed animation pool, optional request budget, failure count and cooldown, cleared when the tab closes. Pet animations load on demand from our local media route or configured media domain. Those requests may include your IP address, browser information and access time, but do not send these storage values.`],
      ]),
      clause(
        '您可以通过浏览器设置管理或禁用 Cookie 与本地存储。禁用必要 Cookie 可能影响本站安全防护功能的正常运行；禁用本地存储后，您的偏好只在当前页面有效。',
        'You can manage or disable cookies and browser storage in your browser settings. Disabling necessary cookies may affect the Site’s security features; with browser storage disabled, your preferences apply only to the current page.'),
    ),
    article('数据安全措施', 'Security Measures',
      clause('我们采取合理的技术与管理措施保护个人信息安全，包括但不限于：', 'We take reasonable technical and organizational measures to protect personal information, including without limitation:', [
        ['全站 HTTPS 加密传输；', 'HTTPS encryption across the whole Site;'],
        ['依托 Cloudflare 的网络层安全防护（WAF、DDoS 缓解、机器人管理）；', 'network-level protection from Cloudflare (WAF, DDoS mitigation and bot management);'],
        ['最小化原则，仅处理服务所必需的信息；', 'data minimization: we handle only the information the service needs;'],
        ['访问凭据与密钥仅存储于服务端环境变量，外部请求经服务端代理，前端不暴露密钥；',
          'credentials and keys are stored only in server-side environment variables, and external requests are proxied through the server so that no keys are exposed in the browser;'],
        ['向第三方接口转发请求时，不附带访客的 IP 地址、Cookie 或浏览器信息。',
          'visitors’ IP addresses, cookies and browser information are not passed on when requests are forwarded to third-party APIs.'],
      ]),
      clause(
        '尽管采取了上述措施，互联网传输与存储不存在绝对安全。如发生个人信息泄露、篡改、丢失等安全事件，我们将依法及时采取补救措施，通知受影响的用户，并按规定向监管部门报告。',
        'Despite these measures, no transmission or storage over the internet is completely secure. If a security incident such as the leakage, alteration or loss of personal information occurs, we will promptly take remedial measures, notify affected users and report to the regulators as required by law.'),
    ),
    article('未成年人保护', 'Protection of Minors',
      clause(
        '本站服务面向一般公众，浏览本站无需提交任何个人信息。若您是不满十四周岁的儿童，请在监护人阅读本政策并给予指导后使用本站，并避免通过电子邮件或输入框提交个人信息。',
        'The Site is intended for the general public, and no personal information is needed to browse it. If you are a child under 14, please use the Site only after your parent or guardian has read this Policy and can guide you, and avoid submitting personal information by email or through input fields.'),
      clause(
        '若我们发现在未事先取得监护人同意的情况下收到了儿童的个人信息，将尽快予以删除。',
        'If we find that we have received a child’s personal information without the prior consent of a parent or guardian, we will delete it as soon as possible.'),
    ),
    article('政策更新', 'Changes to This Policy',
      clause(
        '我们可能适时修订本政策。涉及处理目的、个人信息种类、共享对象等重大变更时，我们将通过网站公告等显著方式通知您。',
        'We may revise this Policy from time to time. For material changes, such as changes to processing purposes, types of personal information or recipients, we will notify you prominently, for example through an announcement on the Site.'),
      clause(
        '修订后的政策自在本站公布之日起生效，并在页面顶部标注最后更新日期。',
        'A revised Policy takes effect on the date it is published on the Site, and the “Last updated” date is shown at the top of the page.'),
    ),
    article('其他', 'Miscellaneous',
      clause(
        '本政策是[《用户协议》](/legal/terms)的组成部分。本政策与《用户协议》就个人信息保护事项存在不一致的，以本政策为准。',
        'This Policy forms part of the [Terms of Service](/legal/terms). Where this Policy and the Terms of Service differ on personal-information matters, this Policy prevails.'),
      clause(
        '本政策以中文撰写并以此为正式版本；英文译本仅供理解参考，两者不一致时以中文版本为准。',
        'This Policy is written in Chinese, and the Chinese version is the official one. The English translation is for reference only; if the two differ, the Chinese version prevails.'),
    ),
  ]);

// ---------------------------------------------------------------------------------------------
// C. 免责声明 / Disclaimer
const disclaimer = build('disclaimer', 'C',
  { zh: '免责声明', en: 'Disclaimer' },
  {
    zh: '本站内容、聚合数据、外部链接、AI 辅助内容与服务可用性的责任边界。',
    en: 'Where our responsibility ends for the Site’s content, aggregated data, external links, AI-assisted content and availability.',
  },
  [
    article('总则', 'General',
      clause(
        '本声明适用于您对 IC Aiming（icaiming.cn，以下称“本站”）的访问与使用，是[《用户协议》](/legal/terms)的组成部分。',
        'This Disclaimer applies to your access to and use of IC Aiming (icaiming.cn, the “Site”) and forms part of the [Terms of Service](/legal/terms).'),
      clause(
        '您使用本站即视为已阅读、理解并同意本声明。若您不同意，请停止使用本站。',
        'By using the Site, you confirm that you have read, understood and agree to this Disclaimer. If you do not agree, please stop using the Site.'),
    ),
    article('内容仅供参考', 'Content for Reference Only',
      clause(
        '本站所有内容仅作为一般性信息参考与学习交流之用，不构成投资、财务、法律、医疗、税务或任何其他领域的专业建议。',
        'All content on the Site is general information for reference, learning and exchange only. It is not investment, financial, legal, medical, tax or any other professional advice.'),
      clause(
        '在作出任何重要决策前，请咨询具备相应资质的专业人士，并自行独立判断与核实。',
        'Before making any important decision, please consult a suitably qualified professional and make your own independent judgment and verification.'),
      clause(
        '本站展示的热榜、开源趋势、限免信息等仅为第三方数据来源的统计或发布结果，不代表本站观点，亦不构成对任何产品、服务或内容的推荐。',
        'Trending lists, open-source trends, free-game offers and similar information on the Site are simply results compiled or published by third-party sources. They do not represent the Site’s views and are not recommendations of any product, service or content.'),
      clause(
        '“答案之书”的答案为随机返回的文字，仅供娱乐，不具有任何预测或指导意义。',
        'Answer Book answers are randomly returned text for entertainment only and have no predictive or advisory value.'),
    ),
    article('聚合数据免责', 'Aggregated Data',
      clause(
        '本站聚合数据来自 GitHub Trending 公开页面及 UAPI（uapis.cn）公开接口等第三方来源，经自动化程序定时抓取、清洗并缓存展示，可能存在以下情形：',
        'The Site’s aggregated data comes from third-party sources such as the public GitHub Trending page and public APIs provided by UAPI (uapis.cn). It is fetched, cleaned and cached by automated programs on a schedule, and may be affected by:', [
          ['数据更新延迟或缓存过期；', 'update delays or stale caches;'],
          ['数据解析错误、字段缺失或格式变化；', 'parsing errors, missing fields or format changes;'],
          ['数据来源本身存在错误或不准确；', 'errors or inaccuracies in the source data itself;'],
          ['热榜标题、每日新闻图等内容由第三方平台、其用户或相关机构发布，可能含有不实、过时或具有争议的信息。',
            'content such as trending titles and the daily news image being published by third-party platforms, their users or other organizations, and possibly containing false, outdated or controversial information.'],
        ]),
      clause(
        '我们不对聚合数据的准确性、及时性、完整性或适用性作任何保证，亦不对您因依赖该等数据所作决策或行为而遭受的损失承担责任。',
        'We make no warranty as to the accuracy, timeliness, completeness or fitness for purpose of aggregated data, and we are not liable for any loss you suffer from decisions or actions taken in reliance on it.'),
      clause(
        '数据在本站的展示不代表本站对其来源或内容的认可或背书。如数据来源方或权利人提出合理要求，我们可更正或移除相关内容。',
        'The display of data on the Site does not mean the Site approves or endorses its source or content. We may correct or remove content upon a reasonable request from the data source or a rights holder.'),
      clause(
        '本站有权随时变更数据来源、抓取方式或展示形式，无需事先通知。',
        'We may change data sources, fetching methods or presentation at any time without prior notice.'),
    ),
    article('外部链接免责', 'External Links',
      clause(
        '本站包含指向第三方网站的外部链接（包括运营者手动整理的收藏链接、热榜条目及社交账号链接），该等链接仅为方便用户而提供。',
        'The Site contains links to third-party websites, including bookmarks curated by the Operator, trending items and social-media profiles. These links are provided for convenience only.'),
      clause(
        '我们无法控制外部网站的内容、服务、隐私实践或可用性，不对其内容及由此产生的任何损失或损害承担责任。',
        'We have no control over the content, services, privacy practices or availability of external websites and are not liable for their content or any loss or damage arising from them.'),
      clause(
        '访问外部链接时，您应遵守目标网站的服务条款与隐私政策；外部链接的失效、跳转异常或安全风险不由本站负责。',
        'When you visit an external link, you should comply with the destination site’s terms of service and privacy policy. The Site is not responsible for broken links, abnormal redirects or security risks on external sites.'),
      clause(
        '本站提供的资源下载如来自第三方，其版权与使用许可以原始发布者的规定为准；请在使用前自行核实文件的安全性与适用性。',
        'Where downloadable resources on the Site come from third parties, their copyright and licensing terms are those set by the original publisher. Please check files for safety and suitability before use.'),
    ),
    article('AI 辅助内容免责', 'AI-assisted Content',
      clause(
        '本站部分内容可能由人工智能（AI）模型生成或辅助生成，包括但不限于摘要、翻译、标题及描述性文字；本站法律文件的英文译本即由 AI 辅助翻译。',
        'Some content on the Site may be generated by, or created with the help of, artificial-intelligence (AI) models, including without limitation summaries, translations, titles and descriptive text. The English translations of the Site’s legal documents were produced with AI assistance.'),
      clause(
        'AI 生成内容可能存在错误、过时信息、“幻觉”（即虚构或失实内容）或偏差，不构成任何专业建议，不应作为您决策的唯一依据。',
        'AI-generated content may contain errors, outdated information, “hallucinations” (fabricated or inaccurate content) or bias. It is not professional advice and should not be the sole basis for your decisions.'),
      clause(
        `本站发布 AI 生成或合成的内容时，将在适用范围内依据《人工智能生成合成内容标识办法》等规定进行标识。欢迎您通过 ${MAIL} 反馈其中的错误。`,
        `When the Site publishes AI-generated or synthetic content, it will label it to the extent required by the Measures for Labeling AI-Generated and Synthetic Content and other applicable rules. Please report any errors to ${MAIL}.`),
    ),
    article('服务可用性与技术免责', 'Availability and Technical Matters',
      clause(
        '本站为个人非商业站点，按“现状”（as is）和“现有”（as available）基础提供服务，不承诺任何服务可用性水平（SLA）。',
        'The Site is a personal, non-commercial website provided on an “as is” and “as available” basis, with no service-level commitment (SLA) of any kind.'),
      clause(
        '因不可抗力、第三方基础设施故障（如 Cloudflare 或第三方接口服务中断）、网络攻击、域名解析异常或政策原因等导致的服务中断、内容不可用或数据丢失，本站不承担责任。',
        'The Site is not liable for service interruptions, unavailable content or data loss caused by force majeure, failures of third-party infrastructure (such as outages at Cloudflare or third-party APIs), cyberattacks, DNS problems, policy changes or similar causes.'),
      clause(
        '本站不对任何浏览器、设备或网络环境下的兼容性与访问体验作保证。',
        'We do not guarantee compatibility or the browsing experience on any particular browser, device or network.'),
    ),
    article('责任限制', 'Limitation of Liability',
      clause(
        '在适用法律允许的最大范围内，运营者对您因使用或无法使用本站而产生的任何间接、附带、后果性、特殊或惩罚性损害（包括但不限于利润损失、数据损失、预期利益损失）不承担责任。',
        'To the maximum extent permitted by applicable law, the Operator is not liable for any indirect, incidental, consequential, special or punitive damages (including without limitation loss of profits, loss of data or loss of expected benefits) arising from your use of, or inability to use, the Site.'),
      clause(
        '本声明不排除或限制依照适用法律不得排除或限制的责任，例如造成对方人身损害的责任，或因故意、重大过失造成对方财产损失的责任。',
        'Nothing in this Disclaimer excludes or limits any liability that cannot be excluded or limited under applicable law, such as liability for personal injury, or for property damage caused intentionally or through gross negligence.'),
    ),
  ]);

// ---------------------------------------------------------------------------------------------
// D. 其他声明 / Other Statements
const notices = build('notices', 'D',
  { zh: '其他声明', en: 'Other Statements' },
  {
    zh: '版权与转载、爬虫与 AI 训练政策、品牌标识、开源致谢、侵权投诉及文件效力。',
    en: 'Copyright and reposting, the crawler and AI-training policy, brand marks, open-source credits, infringement notices and how these documents apply.',
  },
  [
    article('版权与转载声明', 'Copyright and Reposting',
      clause(
        `本站原创内容版权归运营者所有。© ${COPYRIGHT_YEARS} IC Aiming. All rights reserved.`,
        `Copyright in the Site’s original content belongs to the Operator. © ${COPYRIGHT_YEARS} IC Aiming. All rights reserved.`),
      clause(
        '欢迎以链接方式分享本站页面。转载、摘编本站原创内容须事先取得许可，并注明出处及原文链接。',
        'You are welcome to share pages from the Site by linking to them. Reposting or excerpting the Site’s original content requires prior permission and must credit the source with a link to the original.'),
      clause(
        '本站聚合的第三方内容版权归原权利人所有，本站以信息索引与展示为目的使用。',
        'Copyright in third-party content aggregated on the Site belongs to the original rights holders; the Site uses it for indexing and display only.'),
    ),
    article('爬虫与自动化访问声明', 'Crawlers and Automated Access',
      clause('本站通过 [robots.txt](/robots.txt) 公布爬虫政策，各类自动化访问应遵循其中的规则：', 'The Site publishes its crawler policy in [robots.txt](/robots.txt), and all automated access must follow its rules:', [
        ['**搜索引擎**（如 Googlebot、Bingbot、Baiduspider）：允许抓取与索引；',
          '**Search engines** (such as Googlebot, Bingbot and Baiduspider): allowed to crawl and index;'],
        ['**AI 检索与用户发起的实时访问**（如 OAI-SearchBot、ChatGPT-User、Claude-SearchBot、Claude-User、PerplexityBot）：允许，用于在回答中检索、引用并链接本站内容；',
          '**AI search and user-initiated real-time access** (such as OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User and PerplexityBot): allowed, for retrieving, citing and linking to the Site’s content in answers;'],
        ['**AI 训练类抓取**（如 GPTBot、Google-Extended、CCBot、ClaudeBot、Bytespider）：禁止；',
          '**AI-training crawlers** (such as GPTBot, Google-Extended, CCBot, ClaudeBot and Bytespider): not allowed;'],
        [`**数据接口**：任何爬虫均不得抓取 ${code('/api/')} 路径。`,
          `**Data endpoints**: no crawler may access the ${code('/api/')} path.`],
      ]),
      clause(
        `本站的内容信号为 ${code('search=yes, ai-train=no')}：无论通过何种途径获取，本站内容均不得用于训练、微调人工智能模型或构建训练数据集。`,
        `The Site’s content signal is ${code('search=yes, ai-train=no')}: however it is obtained, the Site’s content may not be used to train or fine-tune AI models or to build training datasets.`),
      clause(
        'robots.txt 未列明的其他自动化程序，除遵循上述规则外，未经事先书面许可，不得以超出正常浏览的频率或规模批量抓取、镜像本站内容，详见[《用户协议》第三条](/legal/terms#article-3)。',
        'Other automated programs not named in robots.txt must also follow the rules above and, without prior written permission, must not scrape or mirror the Site’s content at a rate or scale beyond normal browsing. See [Article 3 of the Terms of Service](/legal/terms#article-3).'),
      clause(
        '对违反者，我们保留采取技术限制措施并依法追究责任的权利。',
        'We reserve the right to apply technical restrictions against violators and to pursue liability in accordance with the law.'),
    ),
    article('品牌与标识声明', 'Brand Name and Marks',
      clause(
        '“IC Aiming”名称及本站标识（Logo）由运营者创作和使用，相关权益归运营者所有。上述名称与标识目前尚未注册为商标。',
        'The name “IC Aiming” and the Site’s logo were created and are used by the Operator, who owns the related rights. They are not currently registered as trademarks.'),
      clause(
        '未经许可，任何第三方不得以可能造成混淆、误导或暗示与本站存在关联的方式使用上述名称与标识。',
        'No third party may use this name or these marks without permission in any way that could cause confusion, mislead others or imply an association with the Site.'),
    ),
    article('未成年人保护补充', 'Additional Provisions on Minors',
      clause(
        `本站内容面向一般公众，不包含色情、暴力等不适宜未成年人浏览的内容。聚合展示的热榜等第三方内容由其他平台提供，本站无法逐条审核；如发现不适宜内容，欢迎通过 ${MAIL} 告知。`,
        `The Site’s content is intended for the general public and contains no pornographic, violent or other material unsuitable for minors. Third-party content such as trending lists comes from other platforms and cannot be reviewed item by item; if you find anything unsuitable, please let us know at ${MAIL}.`),
      clause(
        `如监护人发现未成年人未经其同意，通过电子邮件等方式向本站提供了个人信息，可通过 ${MAIL} 联系我们删除。`,
        `If a parent or guardian finds that a minor has provided personal information to the Site, for example by email, without their consent, they may contact us at ${MAIL} to have it deleted.`),
    ),
    article('开源组件与致谢', 'Open-source Components and Acknowledgements',
      clause(
        '本站的构建与运行使用了开源软件、第三方库及第三方服务，其著作权与许可归各自权利人所有，本站依其许可条款使用。',
        'The Site is built and run with open-source software, third-party libraries and third-party services. Their copyrights and licenses belong to their respective owners, and the Site uses them under the terms of those licenses.'),
      clause(
        '本站使用的主要软件与库包括 Astro、TypeScript、Tailwind CSS、Three.js、GSAP、Nanostores、Zod，以及 unified / remark / rehype 系列 Markdown 处理工具。',
        'The main software and libraries used by the Site include Astro, TypeScript, Tailwind CSS, Three.js, GSAP, Nanostores, Zod and the unified / remark / rehype family of Markdown tools.'),
      clause(
        '数据来源致谢：[GitHub Trending](https://github.com/trending)（开源趋势），[UAPI](https://uapis.cn)（热榜、限免游戏、每日新闻图、一言与答案之书接口）。基础设施由 Cloudflare 提供。',
        'Data sources: [GitHub Trending](https://github.com/trending) (open-source trends) and [UAPI](https://uapis.cn) (trending lists, free-game offers, the daily news image, quotes and the Answer Book API). Infrastructure is provided by Cloudflare.'),
    ),
    article('侵权投诉与通知—删除流程', 'Infringement Notices and Takedown',
      clause(`如您认为本站内容侵犯了您的合法权益，请将以下材料发送至 ${MAIL}：`, `If you believe content on the Site infringes your lawful rights, please send the following to ${MAIL}:`, [
        ['权利人身份证明或主体资格证明；', 'proof of the rights holder’s identity or legal status;'],
        ['权利权属证明及涉嫌侵权内容的准确 URL；', 'proof of ownership of the rights, and the exact URL of the allegedly infringing content;'],
        ['您的联系方式；', 'your contact details;'],
        ['关于投诉内容真实性的声明。', 'a statement that the information in your notice is true.'],
      ]),
      clause(
        '我们将在核实后及时采取删除相关内容、断开链接等必要措施，并将处理结果告知投诉人。',
        'After verification, we will promptly take necessary measures such as removing the content or disabling links, and inform you of the outcome.'),
      clause(
        '因错误通知造成他人损害的，通知人应依法承担相应责任。',
        'Anyone whose wrongful notice causes damage to others bears legal liability for it.'),
    ),
    article('语言版本与文件效力', 'Language Versions and Interpretation',
      clause(
        '本站法律文件以中文版本为准。英文译本仅供理解参考；如与中文版本存在冲突，以中文版本为准。',
        'The Chinese versions of the Site’s legal documents are authoritative. The English translations are for reference only; in case of conflict, the Chinese version prevails.'),
      clause(
        '对本站法律文件条款的理解发生争议的，应当按照通常理解予以解释；对条款有两种以上解释的，应当作出不利于条款提供方的解释。运营者对条款的说明不得违反适用法律的强制性规定。',
        'Any dispute over the meaning of a provision in the Site’s legal documents shall be resolved according to its ordinary meaning. Where a provision has two or more possible interpretations, the one less favorable to the party that drafted it shall prevail. Any explanation of the provisions given by the Operator must not contravene mandatory provisions of applicable law.'),
    ),
    article('文件相互关系与更新', 'Relationship Between Documents and Updates',
      clause(
        '本站法律文件包括[《用户协议》](/legal/terms)、[《隐私政策》](/legal/privacy)、[《免责声明》](/legal/disclaimer)及本《其他声明》，各文档相互补充，共同构成您与本站之间的完整约定。',
        'The Site’s legal documents comprise the [Terms of Service](/legal/terms), the [Privacy Policy](/legal/privacy), the [Disclaimer](/legal/disclaimer) and these Other Statements. They complement one another and together form the entire agreement between you and the Site.'),
      clause(
        '就个人信息保护事项，以《隐私政策》为准；就一般服务事项，以《用户协议》为准；就具体事项的免责约定，以《免责声明》为准。',
        'The Privacy Policy prevails on personal-information matters, the Terms of Service on general service matters, and the Disclaimer on specific disclaimers of liability.'),
      clause(
        '我们可能不时更新各文档，更新后的版本自在本站公布之日起生效。',
        'We may update these documents from time to time; updated versions take effect on the date they are published on the Site.'),
    ),
    article('联系方式', 'Contact',
      clause('运营者：IC Aiming 站长（个人开发者）', 'Operator: the webmaster of IC Aiming (an individual developer)'),
      clause(`联系邮箱：${MAIL}`, `Email: ${MAIL}`),
      clause('网站：[https://icaiming.cn](https://icaiming.cn)', 'Website: [https://icaiming.cn](https://icaiming.cn)'),
    ),
  ]);

export const legalDocuments: LegalDocument[] = [terms, privacy, disclaimer, notices];

/** Every static legal route, for the sitemap and tests. */
export const legalPaths = ['/legal', ...legalDocuments.map((doc) => `/legal/${doc.slug}`)];

/** Plain-language summary on /legal. Not part of the binding text. */
export const legalHighlights: (LegalText & { href: string })[] = [
  { zh: '无需账号：浏览本站不需要提供任何个人信息。', en: 'No accounts: you can browse the Site without providing any personal information.', href: '/legal/privacy#article-3' },
  { zh: '本站自身不设置 Cookie，也不运行任何追踪或统计脚本。', en: 'The Site sets no cookies of its own and runs no tracking or analytics scripts.', href: '/legal/privacy#article-8' },
  { zh: '外观偏好与游戏成绩只保存在您的浏览器中。', en: 'Appearance preferences and game scores stay in your browser.', href: '/legal/privacy#article-8' },
  { zh: '“答案之书”的问题经服务端转发至 UAPI，本站不保存。', en: 'Answer Book questions are forwarded via our server to UAPI and are not stored by the Site.', href: '/legal/privacy#article-3' },
  { zh: '服务器日志由 Cloudflare 处理；我们不出售、不出租任何个人信息。', en: 'Server logs are handled by Cloudflare; we never sell or rent personal information.', href: '/legal/privacy#article-6' },
  { zh: '欢迎搜索引擎与 AI 检索访问，禁止将本站内容用于 AI 训练。', en: 'Search engines and AI search are welcome; using the Site’s content for AI training is not allowed.', href: '/legal/notices#article-2' },
];

const DIGITS = '零一二三四五六七八九';
/** 1 → 一, 10 → 十, 12 → 十二, 21 → 二十一 (1–99). */
export function zhNumber(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > 99) throw new RangeError(`zhNumber: ${value}`);
  if (value < 10) return DIGITS[value];
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return `${tens === 1 ? '' : DIGITS[tens]}十${ones ? DIGITS[ones] : ''}`;
}

export function articleHeading(item: LegalArticle): LegalText {
  return { zh: `第${zhNumber(item.no)}条　${item.title.zh}`, en: `Article ${item.no} · ${item.title.en}` };
}

const SAFE_HREF = /^(\/(?!\/)|#|https:\/\/|mailto:)/;
function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Renders the small inline markup used in clause texts to HTML: `code`, **bold** and [label](href).
 * Everything is escaped first; links are kept only for site-relative, #fragment, https: and mailto:
 * targets, and external links open in a new tab.
 */
export function renderInline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, href: string) => {
      if (!SAFE_HREF.test(href)) return label;
      const external = href.startsWith('https://') ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a href="${href}"${external}>${label}</a>`;
    });
}

/** Internal links in clause texts ([label](/legal/…#article-n)), used by tests to catch dead anchors. */
export function internalLinks(text: string): string[] {
  return [...text.matchAll(/\]\((\/[^)\s]*|#[^)\s]*)\)/g)].map((match) => match[1]);
}

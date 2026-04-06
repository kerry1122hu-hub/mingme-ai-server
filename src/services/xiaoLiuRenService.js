const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { Solar } = require('lunar-typescript');

const IS_RENDER = Boolean(process.env.RENDER || process.env.RENDER_EXTERNAL_URL);
const DIVINATION_TIMEZONE = 'Asia/Shanghai';

function resolveDataDir() {
  const customDataDir = `${process.env.MINGME_DATA_DIR || ''}`.trim();
  if (customDataDir) return customDataDir;

  const renderDiskMountPath = `${process.env.RENDER_DISK_MOUNT_PATH || ''}`.trim();
  if (renderDiskMountPath) return path.join(renderDiskMountPath, 'mingme-ai-server-data');

  if (IS_RENDER && fs.existsSync('/data')) return path.join('/data', 'mingme-ai-server-data');
  if (IS_RENDER) return path.join('/tmp', 'mingme-ai-server-data');
  return path.join(__dirname, '..', '..', 'data');
}

const DATA_DIR = resolveDataDir();
const DB_FILE = path.join(DATA_DIR, 'mingme-ai.sqlite');

const PALACE_SEED = [
  {
    engine_version: 'v1.0',
    palace_code: 'da_an',
    palace_name: '大安',
    raw_index: 1,
    fortune_level: '大吉',
    fortune_rank: 1,
    keywords: ['安', '稳', '静', '成'],
    summary: '大安主稳，事可成，宜守正稳推，不宜躁进。',
    general_judgment: '大安主安定、平顺、稳妥、可成，问事多主局面平稳，宜按部就班推进。',
    recommended: ['签约', '定方案', '稳步推进', '求正财', '见贵人'],
    avoid: ['冲动改向', '情绪化决策', '冒进', '过度试错'],
    status: 1,
  },
  {
    engine_version: 'v1.0',
    palace_code: 'liu_lian',
    palace_name: '留连',
    raw_index: 2,
    fortune_level: '小凶',
    fortune_rank: 4,
    keywords: ['拖', '迟', '滞', '缠'],
    summary: '留连主拖，事有阻，宜等宜补，不宜急推。',
    general_judgment: '留连主拖延、阻滞、反复、纠缠，事情多不是不能成，而是难以快成。',
    recommended: ['等待时机', '补资料', '查漏补缺', '做内部准备'],
    avoid: ['强催结果', '仓促拍板', '急着见效', '心急乱推'],
    status: 1,
  },
  {
    engine_version: 'v1.0',
    palace_code: 'su_xi',
    palace_name: '速喜',
    raw_index: 3,
    fortune_level: '中吉',
    fortune_rank: 2,
    keywords: ['快', '喜', '动', '来'],
    summary: '速喜主动，时机已到，宜快推快办，易见回音。',
    general_judgment: '速喜主快、主喜、主消息、主行动见效，利抓时机、利快速推进。',
    recommended: ['发起联系', '推进审批', '见人办事', '快速执行'],
    avoid: ['犹豫', '拖延', '错过窗口', '反复观望'],
    status: 1,
  },
  {
    engine_version: 'v1.0',
    palace_code: 'chi_kou',
    palace_name: '赤口',
    raw_index: 4,
    fortune_level: '中凶',
    fortune_rank: 5,
    keywords: ['口舌', '争', '冲', '误'],
    summary: '赤口主争，防口舌误会，宜缓宜避，不宜硬碰硬。',
    general_judgment: '赤口主口舌、争执、误解、冲撞、惊扰，最忌正面硬刚与情绪化表达。',
    recommended: ['书面沟通', '整理证据', '缓说', '降低预期'],
    avoid: ['正面争执', '电话硬谈', '带情绪表态', '临场翻脸'],
    status: 1,
  },
  {
    engine_version: 'v1.0',
    palace_code: 'xiao_ji',
    palace_name: '小吉',
    raw_index: 5,
    fortune_level: '小吉',
    fortune_rank: 3,
    keywords: ['顺', '和', '小成', '渐进'],
    summary: '小吉主顺，小事可成，宜轻推渐进，不宜押重。',
    general_judgment: '小吉主和顺、小成、渐进，适合处理日常事务与轻量推进。',
    recommended: ['沟通', '见面', '试探', '轻推进', '处理琐事'],
    avoid: ['期望过大', '一步到位', '押重注', '轻局重赌'],
    status: 1,
  },
  {
    engine_version: 'v1.0',
    palace_code: 'kong_wang',
    palace_name: '空亡',
    raw_index: 0,
    fortune_level: '大凶',
    fortune_rank: 6,
    keywords: ['空', '虚', '散', '失'],
    summary: '空亡主空，谋事易落空，宜停缓避耗，不宜强推。',
    general_judgment: '空亡主空、主虚、主散、主难落地，问事多有期待而无结果。',
    recommended: ['暂停', '延后', '重查信息', '减少消耗'],
    avoid: ['拍板', '重投入', '强推进', '过度幻想'],
    status: 1,
  },
];

const SCENE_SEED = [
  ['career', '事业/项目推进', 'da_an', '大吉', '项目稳，可推进，利守成与落地。', ['按计划推进', '定方案', '做确认'], ['临时大改', '冒进', '情绪化翻盘'], '事业落大安，当前宜稳推，适合把已有事情做实做稳。', 1],
  ['career', '事业/项目推进', 'liu_lian', '小凶', '推进偏慢，阻力偏多，容易反复卡住。', ['补材料', '查漏补缺', '等流程', '修订方案'], ['急催', '强推', '逼结果'], '事业落留连，当前阻力偏多，宜补准备，不宜硬推。', 2],
  ['career', '事业/项目推进', 'su_xi', '中吉', '时机较好，利突破，利加速推进。', ['立刻行动', '提交', '争取', '推进关键节点'], ['犹豫拖延'], '事业落速喜，当前窗口较好，适合主动推进并争取结果。', 3],
  ['career', '事业/项目推进', 'chi_kou', '中凶', '容易因沟通或立场问题坏事。', ['先对齐', '留痕', '缓说'], ['正面冲撞', '带情绪推进'], '事业落赤口，当前最怕沟通失误，宜先对齐，不宜硬碰硬。', 4],
  ['career', '事业/项目推进', 'xiao_ji', '小吉', '适合处理执行、协同、收尾、小范围推进。', ['做落实', '跑执行', '轻推进'], ['押重注', '期待一步到位'], '事业落小吉，当前适合稳步执行，小事更容易成。', 5],
  ['career', '事业/项目推进', 'kong_wang', '大凶', '容易空转，表面在动，实则不落地。', ['暂缓', '重查信息', '先观察'], ['拍板', '重投入', '强推进'], '事业落空亡，当前不宜强推，容易白忙，宜先停一步看清。', 6],
  ['wealth', '财/签约/付款', 'da_an', '大吉', '财务偏稳，利正财、利签约、利稳妥成交。', ['签约', '确认条款', '收款', '做正财事务'], ['赌财', '急财', '冲动付款'], '财落大安，当前财务动作偏稳，利正财与稳妥成交。', 1],
  ['wealth', '财/签约/付款', 'liu_lian', '小凶', '财来迟，回款慢，流程拖，合同进展不爽快。', ['等流程', '补条款', '反复核对'], ['急着成交', '急着付款'], '财落留连，当前财务节奏偏慢，宜稳住，不宜急求结果。', 2],
  ['wealth', '财/签约/付款', 'su_xi', '中吉', '利快速成交、快速回款、快速确认。', ['促成交', '签单', '推进付款流程'], ['犹豫', '拖失机会'], '财落速喜，当前利快速推进财务动作，容易见回音。', 3],
  ['wealth', '财/签约/付款', 'chi_kou', '中凶', '合同、付款、沟通细节易出错。', ['核条款', '留凭证', '书面确认'], ['口头约定', '情绪付款', '仓促签字'], '财落赤口，当前最怕因沟通与细节问题导致失财。', 4],
  ['wealth', '财/签约/付款', 'xiao_ji', '小吉', '有小财、小利，适合轻量交易与常规付款。', ['小额成交', '日常财务', '跟进收款'], ['重仓', '押大结果'], '财落小吉，当前利小额顺手之财，不宜押重。', 5],
  ['wealth', '财/签约/付款', 'kong_wang', '大凶', '财象不实，容易预期落空，回款无着。', ['暂缓大额', '重核对方', '重看信息'], ['投大钱', '盲签', '盲付'], '财落空亡，当前财务信号偏虚，不宜做重决策。', 6],
  ['relationship', '感情/关系推进', 'da_an', '大吉', '关系稳，适合守、适合确认、适合修复。', ['稳定互动', '确认关系', '平和交流'], ['闹情绪', '逼结果'], '感情落大安，当前关系偏稳，宜守宜稳，不宜折腾。', 1],
  ['relationship', '感情/关系推进', 'liu_lian', '小凶', '关系拖，态度不明，易反复纠缠。', ['观察', '慢看', '降低预期'], ['逼问', '逼承诺', '急推进'], '感情落留连，当前多拖多缠，宜观察，不宜逼结论。', 2],
  ['relationship', '感情/关系推进', 'su_xi', '中吉', '利表态、利见面、利关系推进。', ['主动联系', '表白', '邀约', '推进'], ['犹豫', '错过机会'], '感情落速喜，当前利主动推进，容易见回应。', 3],
  ['relationship', '感情/关系推进', 'chi_kou', '中凶', '易争吵、误会、冷战、话赶话。', ['少说', '缓说', '先冷静'], ['摊牌', '翻旧账', '硬碰硬'], '感情落赤口，当前最怕情绪化表达，宜缓不宜冲。', 4],
  ['relationship', '感情/关系推进', 'xiao_ji', '小吉', '关系顺手，适合轻推、接近、试探。', ['聊天', '见面', '轻表达'], ['一步到位', '压迫感过强'], '感情落小吉，当前适合慢慢靠近，小步推进更顺。', 5],
  ['relationship', '感情/关系推进', 'kong_wang', '大凶', '情感落空感强，易一厢情愿，难有实质结果。', ['暂缓投入', '看现实反馈'], ['自我脑补', '重情绪投入'], '感情落空亡，当前不宜强求，容易有期待无着落。', 6],
  ['communication', '沟通/发消息/谈话', 'da_an', '大吉', '沟通平稳，适合正常交流与确认。', ['发消息', '确认', '平和表达'], ['突然发难', '翻旧账'], '沟通落大安，当前适合平和表达与正常推进。', 1],
  ['communication', '沟通/发消息/谈话', 'liu_lian', '小凶', '沟通拖沓，回复慢，容易说不清。', ['说重点', '少量沟通', '等回复'], ['长篇催促', '逼表态'], '沟通落留连，当前回复与推进都偏慢，宜简不宜催。', 2],
  ['communication', '沟通/发消息/谈话', 'su_xi', '中吉', '适合主动联系，易见回音。', ['发消息', '打电话', '推动回复'], ['拖着不说'], '沟通落速喜，当前适合主动开口，容易有回应。', 3],
  ['communication', '沟通/发消息/谈话', 'chi_kou', '中凶', '最忌沟通冲突，最易话赶话坏事。', ['书面沟通', '降温', '留痕'], ['当面硬谈', '情绪输出'], '沟通落赤口，当前最怕说急说重，宜缓说留痕。', 4],
  ['communication', '沟通/发消息/谈话', 'xiao_ji', '小吉', '沟通顺手，适合轻聊、试探、铺垫。', ['发消息', '寒暄', '试探表达'], ['上来就谈重话'], '沟通落小吉，当前适合轻沟通与小范围试探。', 5],
  ['communication', '沟通/发消息/谈话', 'kong_wang', '大凶', '沟通容易无效，说了等于没说。', ['先不说', '等时机', '确认信息'], ['强行解释', '重复消耗'], '沟通落空亡，当前沟通效率偏低，容易白说。', 6],
  ['travel', '出行/拜访/见面', 'da_an', '大吉', '出行平顺，见面稳妥，整体可行。', ['出门', '拜访', '会面', '按计划办事'], ['临时大改行程'], '出行落大安，当前出门办事整体平顺，适合按计划进行。', 1],
  ['travel', '出行/拜访/见面', 'liu_lian', '小凶', '行程拖延，见面过程不利落，易等易变。', ['预留时间', '做备选方案'], ['卡点出发', '压缩时间'], '出行落留连，当前行程易拖延，宜放宽节奏。', 2],
  ['travel', '出行/拜访/见面', 'su_xi', '中吉', '见面效率高，利当面推进与拿结果。', ['会面', '面谈', '快速办事'], ['迟到', '拖沓'], '出行落速喜，当前利见面办事，适合快进快出。', 3],
  ['travel', '出行/拜访/见面', 'chi_kou', '中凶', '出门易烦躁，见面易起摩擦。', ['稳住情绪', '控制表达'], ['争执', '硬谈', '临场翻脸'], '出行落赤口，当前见面最怕情绪上头，宜稳住节奏。', 4],
  ['travel', '出行/拜访/见面', 'xiao_ji', '小吉', '出行顺手，适合轻拜访、普通见面。', ['见客户', '跑小事', '日常拜访'], ['押大结果'], '出行落小吉，当前适合日常出行与轻量拜访，整体偏顺。', 5],
  ['travel', '出行/拜访/见面', 'kong_wang', '大凶', '容易白跑、改计划、见了也未必有效。', ['先确认', '少跑冤枉路'], ['临时重投入出行'], '出行落空亡，当前易有白跑或无效会面，宜先确认再动。', 6],
  ['decision', '决策/是否现在做', 'da_an', '大吉', '可定，可做，宜稳妥拍板。', ['做保守正确的决定'], ['激进翻盘'], '决策落大安，当前可定，适合做稳妥正确的选择。', 1],
  ['decision', '决策/是否现在做', 'liu_lian', '小凶', '暂缓，局势未清，时机未到。', ['再看', '再等', '再补信息'], ['急定', '逼自己表态'], '决策落留连，当前局势未明，宜缓一步再定。', 2],
  ['decision', '决策/是否现在做', 'su_xi', '中吉', '可以动，适合抓窗口快速决策。', ['快速判断', '立即执行'], ['犹豫拖延'], '决策落速喜，当前适合抓时机，宜快定快动。', 3],
  ['decision', '决策/是否现在做', 'chi_kou', '中凶', '不宜冲动作决策，尤其不宜情绪拍板。', ['冷静', '书面梳理', '听第二意见'], ['吵着决定', '火中拍板'], '决策落赤口，当前最忌带情绪做决定。', 4],
  ['decision', '决策/是否现在做', 'xiao_ji', '小吉', '小事可定，大事宜谨慎。', ['定小事', '先走一步'], ['重注式决定'], '决策落小吉，当前小事可做，大事不宜押重。', 5],
  ['decision', '决策/是否现在做', 'kong_wang', '大凶', '不宜定，容易判断失真、结果落空。', ['暂停', '核信息', '再观察'], ['拍板', '承诺', '重投入'], '决策落空亡，当前不宜定，容易看错或落空。', 6],
].map(([scene_type, scene_name, palace_code, fortune_level, judgment, recommended, avoid, short_output, sort_order]) => ({
  engine_version: 'v1.0',
  scene_type,
  scene_name,
  palace_code,
  fortune_level,
  judgment,
  recommended,
  avoid,
  short_output,
  sort_order,
  status: 1,
}));

const DOUBLE_SEED = [
  ['da_an', 'da_an', '大安加大安', '顶级吉', '大吉中大吉，局稳，势稳，人稳，事稳。', '事情基础与当下推进都稳，最利定、守、成。', ['定方案', '签约', '确认关系', '落地执行'], ['自乱节奏', '临时大改', '画蛇添足'], '大安加大安，事稳可成，宜照原计划稳步落实。'],
  ['da_an', 'liu_lian', '大安加留连', '中风险', '底子是好的，但推进偏慢。', '事情本身可成，但当下推进节奏拖，越急越慢。', ['稳住', '补材料', '等流程', '按部就班'], ['急催', '因慢乱改方向'], '大安加留连，底子不坏，但推进偏慢，宜稳住等成。'],
  ['da_an', 'su_xi', '大安加速喜', '顶级吉', '稳中转快，吉上加动。', '事情本来就能成，当下又有加速窗口。', ['立刻推进', '定关键节点', '面谈', '发起行动'], ['犹豫', '错过时机'], '大安加速喜，稳中有快，当前正是推进窗口。'],
  ['da_an', 'chi_kou', '大安加赤口', '中风险', '事能成，但过程易起口舌。', '结果未必坏，过程可能因人际摩擦变复杂。', ['书面确认', '先礼后事', '控制语气'], ['争执', '当面硬刚', '情绪表达'], '大安加赤口，事能成，但过程易生口舌，宜稳不宜争。'],
  ['da_an', 'xiao_ji', '大安加小吉', '顶级吉', '稳中有顺，成中有和。', '适合做执行、收口、落实、关系修复。', ['推执行', '做确认', '日常推进', '温和沟通'], ['期望过高', '押极重结果'], '大安加小吉，稳中见顺，适合把事情温和做成。'],
  ['da_an', 'kong_wang', '大安加空亡', '中风险', '事情本身不坏，但当前触碰点偏空。', '底子尚可，但当前时点不对，发力容易白费。', ['先缓一下', '等更实的时机', '再确认信息'], ['强推', '急于拍板'], '大安加空亡，事底不坏，但此刻发力偏空，宜缓不宜硬推。'],
  ['liu_lian', 'da_an', '留连加大安', '中上', '拖中有稳，虽慢但可成。', '事情本身拖，但当前如果守得住，最后有落定机会。', ['等时机', '做扎实准备', '维持节奏'], ['因拖而乱', '半途放弃'], '留连加大安，事虽拖，但守得住，后面仍可成。'],
  ['liu_lian', 'liu_lian', '留连加留连', '高风险', '双重拖滞，最慢之局。', '推进感极弱，容易反复横跳，短期难见结果。', ['观察', '补漏', '等', '放低预期'], ['急催', '逼结论', '情绪加压'], '留连加留连，拖滞极重，短期难爽快，不宜急求结果。'],
  ['liu_lian', 'su_xi', '留连加速喜', '中上', '拖中有转机。', '总体仍慢，但短期内可能突然有回音。', ['顺势推进', '立刻跟进机会', '快速回应窗口'], ['仍按慢节奏犹豫', '错过短暂转机'], '留连加速喜，拖局中见转机，宜抓住突然出现的窗口。'],
  ['liu_lian', 'chi_kou', '留连加赤口', '高风险', '又拖又争。', '拖延、误解、对立并存，情绪消耗大。', ['收口', '稳情绪', '减少正面冲突', '书面留痕'], ['边拖边吵', '焦虑催逼'], '留连加赤口，拖中带争，越急越乱，不宜硬谈。'],
  ['liu_lian', 'xiao_ji', '留连加小吉', '中上', '拖中有缓和。', '事情还是慢，但当下不算太硬，适合缓慢推进。', ['小步推进', '温和试探', '日常跟进'], ['期待立刻翻盘', '重动作解决慢问题'], '留连加小吉，虽然仍慢，但可缓步推进，宜小步慢走。'],
  ['liu_lian', 'kong_wang', '留连加空亡', '高风险', '拖到发空。', '最怕一直等，最后等空，易白耗时间。', ['及时止损', '重新评估', '不要无限拖'], ['死守幻想', '一直耗着不变'], '留连加空亡，拖久易空，宜及时重评，不宜无止境消耗。'],
  ['su_xi', 'da_an', '速喜加大安', '顶级吉', '快中有稳。', '既有窗口，又有承接力，非常适合推进。', ['抢窗口', '推进谈判', '定方案', '快速落实'], ['犹豫', '临门退缩'], '速喜加大安，快中有稳，适合趁势推进并落实。'],
  ['su_xi', 'liu_lian', '速喜加留连', '中风险', '先快后卡。', '开头有动静，但后续未必顺畅，容易开头好后面拖。', ['先抓住机会', '补流程', '做跟进机制'], ['以为已经完全成了', '放松后续承接'], '速喜加留连，前面有动，后面易拖，宜先抢机再补承接。'],
  ['su_xi', 'su_xi', '速喜加速喜', '顶级吉', '双动双喜，最快之局。', '回音快，节奏快，机会快，成败也快。', ['立刻做', '快速联络', '快速拍板', '抢节奏'], ['犹豫', '慢吞吞', '错过窗口'], '速喜加速喜，双动双喜，当前最利迅速行动。'],
  ['su_xi', 'chi_kou', '速喜加赤口', '中风险', '动中带冲。', '事情会动，但越动越容易起争执或误会。', ['快但稳语言', '留痕', '控节奏'], ['快中带火', '一激动就上头'], '速喜加赤口，机会虽快，但易因冲动坏事，宜快而不躁。'],
  ['su_xi', 'xiao_ji', '速喜加小吉', '中上', '快中带顺。', '既有速度，也有配合度，适合主动出手。', ['联系', '见面', '跟进', '试探后推进'], ['期望一步登天', '动作过大'], '速喜加小吉，快中有顺，适合轻快推进。'],
  ['su_xi', 'kong_wang', '速喜加空亡', '中风险', '看似很快，后劲发空。', '容易出现刚开始有反应，后来没下文。', ['先确认真实性', '留后手', '别一见动静就全押'], ['过度乐观', '迅速投入全部资源'], '速喜加空亡，前面虽快，后续易空，宜先验证再加码。'],
  ['chi_kou', 'da_an', '赤口加大安', '中上', '争中有稳。', '事情过程会有摩擦，但底子尚能稳住。', ['克制表达', '回到事实', '寻求稳定方案'], ['情绪升级', '争输赢'], '赤口加大安，虽有口舌，但若稳得住，事情仍可回正。'],
  ['chi_kou', 'liu_lian', '赤口加留连', '高风险', '争中又拖。', '消耗大，容易谈而不决、争而不定。', ['暂停正面交锋', '拉开距离', '先解决卡点'], ['一边吵一边逼推进', '情绪化压迫'], '赤口加留连，争而不决，拖而不快，宜退一步重整。'],
  ['chi_kou', 'su_xi', '赤口加速喜', '高风险', '冲突来得快。', '变化速度很高，处理得好也可快速定局。', ['先控火', '快速切回重点', '不拖泥带水'], ['话赶话', '赌气', '争一时痛快'], '赤口加速喜，冲突来得快，宜立刻降火，不可顺着情绪走。'],
  ['chi_kou', 'chi_kou', '赤口加赤口', '高风险', '双重口舌，争气最重。', '易正面冲突，易误解升级，易翻脸。', ['暂停关键沟通', '改书面', '延后再谈'], ['当场争到底', '电话硬刚', '带火拍板'], '赤口加赤口，口舌最烈，当前最忌正面冲撞。'],
  ['chi_kou', 'xiao_ji', '赤口加小吉', '中上', '有争，但可缓和。', '虽然过程容易起摩擦，但并非不可修复。', ['软化语气', '找台阶', '小范围修复'], ['上纲上线', '逼对方立刻认错'], '赤口加小吉，虽有口舌，但仍有缓和余地，宜软化处理。'],
  ['chi_kou', 'kong_wang', '赤口加空亡', '高风险', '争后落空。', '吵了、耗了，最后却什么也没落下。', ['立刻止损', '少说', '拉开', '先停战'], ['越空越争', '把空局吵成死局'], '赤口加空亡，争后易空，宜止损退一步，不宜继续消耗。'],
  ['xiao_ji', 'da_an', '小吉加大安', '顶级吉', '小顺转稳。', '事情起步不大，但后续能稳下来，适合收口落地。', ['细推进', '温和确认', '做收尾与落地'], ['轻敌', '误判成大开'], '小吉加大安，小顺转稳，适合把事情踏实落地。'],
  ['xiao_ji', 'liu_lian', '小吉加留连', '中风险', '小顺中带拖。', '有点顺，但不快，适合慢慢磨。', ['小步走', '跟进', '继续观察'], ['猛推', '过度拔高预期'], '小吉加留连，虽有顺势，但推进偏慢，宜轻推慢走。'],
  ['xiao_ji', 'su_xi', '小吉加速喜', '中上', '顺中有快。', '事情有顺手感，机会也来得快。', ['联系', '试探后迅速推进', '见面', '处理具体事项'], ['动作过大', '因顺而轻率'], '小吉加速喜，顺中有快，适合轻快推进与及时行动。'],
  ['xiao_ji', 'chi_kou', '小吉加赤口', '中风险', '本可顺，偏偏易被说坏。', '事情基础不差，但容易因为表达失误而折损顺势。', ['少说重话', '柔和推进', '多确认少判断'], ['嘴快', '带情绪试探', '逞口舌'], '小吉加赤口，本可顺成，最怕说坏，宜柔和表达。'],
  ['xiao_ji', 'xiao_ji', '小吉加小吉', '中上', '双顺小成。', '日常很顺，不一定大突破，但适合细水长流推进。', ['日常推进', '见面', '沟通', '小额事务'], ['期待一步登天', '轻局重赌'], '小吉加小吉，双顺小成，适合日常推进与细水长流。'],
  ['xiao_ji', 'kong_wang', '小吉加空亡', '中风险', '表面顺，内里空。', '一开始感觉不错，但推进下去发现不实。', ['保持轻量', '先验证', '不要急着上强度'], ['投入过重', '把表面反馈当真实落地'], '小吉加空亡，表面虽顺，后劲偏空，宜轻试不宜重押。'],
  ['kong_wang', 'da_an', '空亡加大安', '中上', '空中求稳。', '事情本身偏虚，但当前若处理稳妥，能减少损失。', ['缩小目标', '保守处理', '稳住局面'], ['误判全盘可成', '激进进攻'], '空亡加大安，空局中可求稳，宜收缩求实，不宜激进。'],
  ['kong_wang', 'liu_lian', '空亡加留连', '高风险', '空中带拖。', '事情既虚又慢，最怕一直耗着，最后无着无落。', ['停止空耗', '尽快评估值不值得继续', '设止损点'], ['无限拖延', '把希望建立在幻想上'], '空亡加留连，既空又拖，宜尽快止耗，不宜继续死撑。'],
  ['kong_wang', 'su_xi', '空亡加速喜', '高风险', '虚中有动。', '会有消息、动静、反应，但未必实，最怕空欢喜。', ['看证据', '看落地', '看实际承接'], ['因一点动静就当真', '提前过度投入'], '空亡加速喜，虽有动静，但未必为实，谨防空欢喜。'],
  ['kong_wang', 'chi_kou', '空亡加赤口', '高风险', '空中带争。', '一边虚，一边还容易闹，是既耗神又无结果的组合。', ['先停口舌', '不争无谓对错', '保留精力'], ['在虚局里争输赢', '边空边吵'], '空亡加赤口，空事易争，越争越耗，宜停口避耗。'],
  ['kong_wang', 'xiao_ji', '空亡加小吉', '中上', '空中带一点顺。', '虽然整体偏虚，但不至于全无缓冲，适合轻量试探。', ['轻试', '小步验证', '保持弹性'], ['因有一点顺感就当成真局'], '空亡加小吉，虽有一点顺势，但本质仍虚，宜轻试不宜重押。'],
  ['kong_wang', 'kong_wang', '空亡加空亡', '高风险', '双空之局。', '最虚的一组，易白想、白忙、白等、白耗。', ['暂停', '休息', '延后', '重新确认现实条件'], ['拍板', '投入', '强行推进', '自我催眠式坚持'], '空亡加空亡，双空无着，当前最不宜强行推进。'],
].map(([main_palace_code, secondary_palace_code, combo_name, combo_level, judgment, trend, recommended, avoid, short_output]) => ({
  engine_version: 'v1.1',
  main_palace_code,
  secondary_palace_code,
  combo_code: `${main_palace_code}__${secondary_palace_code}`,
  combo_name,
  combo_level,
  judgment,
  trend,
  recommended,
  avoid,
  short_output,
  status: 1,
}));

const ENGINE_CONFIG_SEED = [
  {
    engine_version: 'v1.0',
    engine_name: 'xiao_liu_ren',
    formula: '(M + D + T - 2) % 6',
    palace_order: ['kong_wang', 'da_an', 'liu_lian', 'su_xi', 'chi_kou', 'xiao_ji'],
    time_branch_mapping: { 子: 1, 丑: 2, 寅: 3, 卯: 4, 辰: 5, 巳: 6, 午: 7, 未: 8, 申: 9, 酉: 10, 戌: 11, 亥: 12 },
    double_palace_enabled: 0,
    status: 1,
  },
  {
    engine_version: 'v1.1',
    engine_name: 'xiao_liu_ren',
    formula: '(M + D + T - 2) % 6',
    palace_order: ['kong_wang', 'da_an', 'liu_lian', 'su_xi', 'chi_kou', 'xiao_ji'],
    time_branch_mapping: { 子: 1, 丑: 2, 寅: 3, 卯: 4, 辰: 5, 巳: 6, 午: 7, 未: 8, 申: 9, 酉: 10, 戌: 11, 亥: 12 },
    double_palace_enabled: 1,
    status: 1,
  },
];

const RISK_CONFIG_SEED = [
  { engine_version: 'v1.0', mode: 'current', daily_limit: 5, two_hour_limit: 3, cooldown_minutes: 120, cache_slot_type: 'hour', status: 1 },
  { engine_version: 'v1.0', mode: 'event', daily_limit: 5, two_hour_limit: 3, cooldown_minutes: 120, cache_slot_type: 'hour', status: 1 },
  { engine_version: 'v1.1', mode: 'current', daily_limit: 5, two_hour_limit: 3, cooldown_minutes: 120, cache_slot_type: 'hour', status: 1 },
  { engine_version: 'v1.1', mode: 'event', daily_limit: 5, two_hour_limit: 3, cooldown_minutes: 120, cache_slot_type: 'hour', status: 1 },
];

const ACTION_PRINCIPLE_BY_PALACE = {
  da_an: '守正稳推',
  liu_lian: '等、守、补',
  su_xi: '立刻行动',
  chi_kou: '降火避争',
  xiao_ji: '轻推渐进',
  kong_wang: '暂停避耗',
};

function ensureDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const db = new Database(DB_FILE);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS palace_master (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engine_version TEXT NOT NULL,
      palace_code TEXT NOT NULL,
      palace_name TEXT NOT NULL,
      raw_index INTEGER NOT NULL,
      fortune_level TEXT NOT NULL,
      fortune_rank INTEGER NOT NULL,
      keywords TEXT NOT NULL,
      summary TEXT NOT NULL,
      general_judgment TEXT NOT NULL,
      recommended TEXT NOT NULL,
      avoid TEXT NOT NULL,
      status INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(engine_version, palace_code),
      UNIQUE(engine_version, raw_index)
    );

    CREATE TABLE IF NOT EXISTS scene_palace_mapping (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engine_version TEXT NOT NULL,
      scene_type TEXT NOT NULL,
      scene_name TEXT NOT NULL,
      palace_code TEXT NOT NULL,
      fortune_level TEXT NOT NULL,
      judgment TEXT NOT NULL,
      recommended TEXT NOT NULL,
      avoid TEXT NOT NULL,
      short_output TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 1,
      status INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(engine_version, scene_type, palace_code)
    );

    CREATE TABLE IF NOT EXISTS double_palace_mapping (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engine_version TEXT NOT NULL,
      main_palace_code TEXT NOT NULL,
      secondary_palace_code TEXT NOT NULL,
      combo_code TEXT NOT NULL,
      combo_name TEXT NOT NULL,
      combo_level TEXT NOT NULL,
      judgment TEXT NOT NULL,
      trend TEXT NOT NULL,
      recommended TEXT NOT NULL,
      avoid TEXT NOT NULL,
      short_output TEXT NOT NULL,
      status INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(engine_version, main_palace_code, secondary_palace_code),
      UNIQUE(engine_version, combo_code)
    );

    CREATE TABLE IF NOT EXISTS engine_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engine_version TEXT NOT NULL UNIQUE,
      engine_name TEXT NOT NULL,
      formula TEXT NOT NULL,
      palace_order TEXT NOT NULL,
      time_branch_mapping TEXT NOT NULL,
      double_palace_enabled INTEGER NOT NULL DEFAULT 0,
      status INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS risk_control_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engine_version TEXT NOT NULL,
      mode TEXT NOT NULL,
      daily_limit INTEGER NOT NULL,
      two_hour_limit INTEGER NOT NULL,
      cooldown_minutes INTEGER NOT NULL,
      cache_slot_type TEXT NOT NULL,
      status INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(engine_version, mode)
    );

    CREATE TABLE IF NOT EXISTS xiao_liu_ren_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identity_key TEXT NOT NULL,
      user_key TEXT,
      member_tier TEXT NOT NULL,
      engine_version TEXT NOT NULL,
      mode TEXT NOT NULL,
      scene_type TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      date_key TEXT NOT NULL,
      slot_key TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_xlr_usage_identity_time
    ON xiao_liu_ren_usage(identity_key, requested_at DESC);

    CREATE INDEX IF NOT EXISTS idx_xlr_usage_identity_date
    ON xiao_liu_ren_usage(identity_key, date_key);
  `);

  return db;
}

const db = ensureDatabase();

function serialize(value) {
  return JSON.stringify(value || []);
}

function parseJson(value, fallback = []) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function seedData() {
  const insertPalace = db.prepare(`
    INSERT OR IGNORE INTO palace_master (
      engine_version, palace_code, palace_name, raw_index, fortune_level, fortune_rank,
      keywords, summary, general_judgment, recommended, avoid, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  PALACE_SEED.forEach((item) => {
    insertPalace.run(
      item.engine_version,
      item.palace_code,
      item.palace_name,
      item.raw_index,
      item.fortune_level,
      item.fortune_rank,
      serialize(item.keywords),
      item.summary,
      item.general_judgment,
      serialize(item.recommended),
      serialize(item.avoid),
      item.status
    );
  });

  const insertScene = db.prepare(`
    INSERT OR IGNORE INTO scene_palace_mapping (
      engine_version, scene_type, scene_name, palace_code, fortune_level, judgment,
      recommended, avoid, short_output, sort_order, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  SCENE_SEED.forEach((item) => {
    insertScene.run(
      item.engine_version,
      item.scene_type,
      item.scene_name,
      item.palace_code,
      item.fortune_level,
      item.judgment,
      serialize(item.recommended),
      serialize(item.avoid),
      item.short_output,
      item.sort_order,
      item.status
    );
  });

  const insertDouble = db.prepare(`
    INSERT OR IGNORE INTO double_palace_mapping (
      engine_version, main_palace_code, secondary_palace_code, combo_code, combo_name, combo_level,
      judgment, trend, recommended, avoid, short_output, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  DOUBLE_SEED.forEach((item) => {
    insertDouble.run(
      item.engine_version,
      item.main_palace_code,
      item.secondary_palace_code,
      item.combo_code,
      item.combo_name,
      item.combo_level,
      item.judgment,
      item.trend,
      serialize(item.recommended),
      serialize(item.avoid),
      item.short_output,
      item.status
    );
  });

  const insertEngine = db.prepare(`
    INSERT OR IGNORE INTO engine_config (
      engine_version, engine_name, formula, palace_order, time_branch_mapping, double_palace_enabled, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  ENGINE_CONFIG_SEED.forEach((item) => {
    insertEngine.run(
      item.engine_version,
      item.engine_name,
      item.formula,
      serialize(item.palace_order),
      serialize(item.time_branch_mapping),
      item.double_palace_enabled,
      item.status
    );
  });

  const insertRisk = db.prepare(`
    INSERT OR IGNORE INTO risk_control_config (
      engine_version, mode, daily_limit, two_hour_limit, cooldown_minutes, cache_slot_type, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  RISK_CONFIG_SEED.forEach((item) => {
    insertRisk.run(
      item.engine_version,
      item.mode,
      item.daily_limit,
      item.two_hour_limit,
      item.cooldown_minutes,
      item.cache_slot_type,
      item.status
    );
  });
}

seedData();

const SCENE_FALLBACKS = {
  career: '事业/项目推进',
  wealth: '财/签约/付款',
  relationship: '感情/关系推进',
  communication: '沟通/发消息/谈话',
  travel: '出行/拜访/见面',
  decision: '决策/是否现在做',
};

const TIME_BRANCHES = [
  { branch: '子', start: 23, end: 1, num: 1 },
  { branch: '丑', start: 1, end: 3, num: 2 },
  { branch: '寅', start: 3, end: 5, num: 3 },
  { branch: '卯', start: 5, end: 7, num: 4 },
  { branch: '辰', start: 7, end: 9, num: 5 },
  { branch: '巳', start: 9, end: 11, num: 6 },
  { branch: '午', start: 11, end: 13, num: 7 },
  { branch: '未', start: 13, end: 15, num: 8 },
  { branch: '申', start: 15, end: 17, num: 9 },
  { branch: '酉', start: 17, end: 19, num: 10 },
  { branch: '戌', start: 19, end: 21, num: 11 },
  { branch: '亥', start: 21, end: 23, num: 12 },
];

function detectSceneType(question = '', preferredScene = '') {
  const scene = `${preferredScene || ''}`.trim();
  if (scene && SCENE_FALLBACKS[scene]) return scene;
  const text = `${question || ''}`;
  if (/(合作|项目|工作|事业|升职|跳槽|创业|推进)/.test(text)) return 'career';
  if (/(钱|财|回款|付款|合同|签约|投资|成交)/.test(text)) return 'wealth';
  if (/(感情|关系|复合|前任|喜欢|相处|婚姻)/.test(text)) return 'relationship';
  if (/(消息|沟通|联系|发给|谈话|说清楚)/.test(text)) return 'communication';
  if (/(出门|出行|拜访|见面|约见|路上)/.test(text)) return 'travel';
  return 'decision';
}

function resolveSourceDate(eventDateTime) {
  const base = eventDateTime ? new Date(eventDateTime) : new Date();
  return Number.isNaN(base.getTime()) ? new Date() : base;
}

function buildChinaDateParts(eventDateTime) {
  const sourceDate = resolveSourceDate(eventDateTime);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: DIVINATION_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = {};
  for (const item of formatter.formatToParts(sourceDate)) {
    if (item.type !== 'literal') {
      parts[item.type] = item.value;
    }
  }
  return {
    sourceDate,
    timezone: DIVINATION_TIMEZONE,
    year: Number(parts.year || 0),
    month: Number(parts.month || 0),
    day: Number(parts.day || 0),
    hour: Number(parts.hour || 0),
    minute: Number(parts.minute || 0),
    second: Number(parts.second || 0),
  };
}

function buildChinaIsoString(chinaParts) {
  const pad = (value) => `${value || 0}`.padStart(2, '0');
  return `${chinaParts.year}-${pad(chinaParts.month)}-${pad(chinaParts.day)}T${pad(chinaParts.hour)}:${pad(chinaParts.minute)}:${pad(chinaParts.second)}+08:00`;
}

function getTimeBranch(hour) {
  if (hour === 23 || hour < 1) return TIME_BRANCHES[0];
  return TIME_BRANCHES.find((item) => hour >= item.start && hour < item.end) || TIME_BRANCHES[0];
}

function pickLikelyConcern(sceneType) {
  const mapping = {
    career: '这件事更像是在问：现在该不该继续推，还是该先收一收节奏。',
    wealth: '这件事更像是在问：这笔钱、这份约、这次付款，当前到底稳不稳。',
    relationship: '这件事更像是在问：这段关系现在该主动一点，还是该先稳住自己。',
    communication: '这件事更像是在问：此刻要不要联系，对方会不会接住这次表达。',
    travel: '这件事更像是在问：这次出门或见面，跑这一趟值不值、顺不顺。',
    decision: '这件事更像是在问：现在是不是拍板的时点，还是该再缓一步。',
  };
  return mapping[sceneType] || mapping.decision;
}

function getEngineConfig(engineVersion = 'v1.1') {
  const row = db.prepare(`
    SELECT *
    FROM engine_config
    WHERE engine_version = ? AND status = 1
    LIMIT 1
  `).get(engineVersion);
  if (!row) throw new Error(`Missing engine config for ${engineVersion}`);
  return {
    ...row,
    palace_order: parseJson(row.palace_order),
    time_branch_mapping: parseJson(row.time_branch_mapping, {}),
  };
}

function getPalaceByCode(engineVersion, palaceCode) {
  const row = db.prepare(`
    SELECT *
    FROM palace_master
    WHERE engine_version = ? AND palace_code = ? AND status = 1
    LIMIT 1
  `).get(engineVersion === 'v1.1' ? 'v1.0' : engineVersion, palaceCode);
  if (!row) return null;
  return {
    ...row,
    keywords: parseJson(row.keywords),
    recommended: parseJson(row.recommended),
    avoid: parseJson(row.avoid),
    priority_rank: row.fortune_rank,
    core_keywords: parseJson(row.keywords),
    core_summary: row.summary,
    action_principle: ACTION_PRINCIPLE_BY_PALACE[row.palace_code] || '',
  };
}

function getSceneMapping(sceneType, palaceCode) {
  const row = db.prepare(`
    SELECT *
    FROM scene_palace_mapping
    WHERE engine_version = 'v1.0' AND scene_type = ? AND palace_code = ? AND status = 1
    LIMIT 1
  `).get(sceneType, palaceCode);
  if (!row) return null;
  return {
    ...row,
    recommended: parseJson(row.recommended),
    avoid: parseJson(row.avoid),
  };
}

function getDoubleMapping(mainPalaceCode, secondaryPalaceCode) {
  const row = db.prepare(`
    SELECT *
    FROM double_palace_mapping
    WHERE engine_version = 'v1.1' AND main_palace_code = ? AND secondary_palace_code = ? AND status = 1
    LIMIT 1
  `).get(mainPalaceCode, secondaryPalaceCode);
  if (!row) return null;
  return {
    ...row,
    recommended: parseJson(row.recommended),
    avoid: parseJson(row.avoid),
  };
}

function buildSceneStandardPacket(sceneType, sceneName, mainPalace, sceneMapping) {
  if (!mainPalace && !sceneMapping) return null;
  return {
    scene_type: sceneType,
    scene_name: sceneMapping?.scene_name || sceneName || '',
    palace_code: mainPalace?.palace_code || sceneMapping?.palace_code || '',
    palace_name: mainPalace?.palace_name || '',
    fortune_level: sceneMapping?.fortune_level || mainPalace?.fortune_level || '',
    judgment: sceneMapping?.judgment || mainPalace?.general_judgment || '',
    recommended: Array.from(new Set([
      ...(sceneMapping?.recommended || []),
      ...(mainPalace?.recommended || []),
    ])).slice(0, 6),
    avoid: Array.from(new Set([
      ...(sceneMapping?.avoid || []),
      ...(mainPalace?.avoid || []),
    ])).slice(0, 6),
    short_output: sceneMapping?.short_output || mainPalace?.summary || '',
    action_principle: mainPalace?.action_principle || '',
    priority_rank: mainPalace?.priority_rank || mainPalace?.fortune_rank || null,
  };
}

function buildDoublePalacePacket(mainPalace, secondaryPalace, comboMapping) {
  if (!mainPalace) {
    return {
      enabled: false,
      main_palace: null,
      secondary_palace: null,
      combo_code: '',
      combo_name: '',
      combo_level: '',
      judgment: '',
      trend: '',
      recommended: [],
      avoid: [],
      short_output: '',
    };
  }

  return {
    enabled: Boolean(secondaryPalace && comboMapping),
    main_palace: mainPalace
      ? {
          palace_code: mainPalace.palace_code,
          palace_name: mainPalace.palace_name,
          fortune_level: mainPalace.fortune_level,
        }
      : null,
    secondary_palace: secondaryPalace
      ? {
          palace_code: secondaryPalace.palace_code,
          palace_name: secondaryPalace.palace_name,
          fortune_level: secondaryPalace.fortune_level,
        }
      : null,
    combo_code: comboMapping?.combo_code || '',
    combo_name: comboMapping?.combo_name || '',
    combo_level: comboMapping?.combo_level || '',
    judgment: comboMapping?.judgment || '',
    trend: comboMapping?.trend || '',
    recommended: (comboMapping?.recommended || []).slice(0, 4),
    avoid: (comboMapping?.avoid || []).slice(0, 4),
    short_output: comboMapping?.short_output || '',
  };
}

function normalizeChartCluesSafe(chart = {}) {
  const concerns = [];
  const narrative = chart?.narrative || {};
  const core = `${narrative?.core_summary || chart?.coreSummary || ''}`.trim();
  const stage = `${narrative?.stage_summary || chart?.stageSummary || ''}`.trim();
  if (core) concerns.push(`命盘主线：${core}`);
  if (stage) concerns.push(`当前阶段：${stage}`);
  const actionHints = Array.isArray(narrative?.action_hints) ? narrative.action_hints : [];
  if (actionHints.length) concerns.push(`近期动作倾向：${actionHints.slice(0, 2).join('；')}`);
  return concerns.join('｜');
}

function buildLunarContext(chinaParts) {
  const solar = Solar.fromYmdHms(
    chinaParts.year,
    chinaParts.month,
    chinaParts.day,
    chinaParts.hour,
    chinaParts.minute,
    chinaParts.second
  );
  const lunar = solar.getLunar();
  return {
    solar,
    lunar,
    lunarMonth: lunar.getMonth(),
    lunarDay: lunar.getDay(),
  };
}

function createRequestId() {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `req_${stamp}_${rand}`;
}

function buildDatetimeSlot(chinaParts, mode = 'current') {
  const year = chinaParts.year;
  const month = `${chinaParts.month}`.padStart(2, '0');
  const day = `${chinaParts.day}`.padStart(2, '0');
  if (mode === 'event') {
    const hour = `${chinaParts.hour}`.padStart(2, '0');
    return `${year}-${month}-${day}T${hour}`;
  }
  const hour = `${chinaParts.hour}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hour}`;
}

function buildChinaDateKey(chinaParts) {
  const year = chinaParts.year;
  const month = `${chinaParts.month}`.padStart(2, '0');
  const day = `${chinaParts.day}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function calculateRawIndex(month, day, timeNumber) {
  const raw = (Number(month) + Number(day) + Number(timeNumber) - 2) % 6;
  return raw < 0 ? raw + 6 : raw;
}

function calculateSecondaryIndex(day, timeNumber) {
  const raw = (Number(day) + Number(timeNumber) - 2) % 6;
  return raw < 0 ? raw + 6 : raw;
}

function normalizeDivinationTier(memberTier = '') {
  const tier = `${memberTier || ''}`.trim().toLowerCase();
  if (!tier) return 'free';
  if (['member', 'premium', 'vip', 'paid', 'monthly', 'annual'].includes(tier)) return 'member';
  if (tier.includes('member') || tier.includes('premium') || tier.includes('vip') || tier.includes('annual') || tier.includes('month')) {
    return 'member';
  }
  return 'free';
}

function getDivinationLimits(memberTier = '') {
  const normalizedTier = normalizeDivinationTier(memberTier);
  if (normalizedTier === 'member') {
    return {
      normalizedTier,
      dailyLimit: 6,
      cooldownMinutes: 240,
    };
  }
  return {
    normalizedTier,
    dailyLimit: 1,
    cooldownMinutes: 240,
  };
}

function resolveUsageIdentity({ userKey, clientMeta } = {}) {
  const userIdentity = `${userKey || ''}`.trim();
  if (userIdentity) return userIdentity;
  const clientUserId = `${clientMeta?.user_id || ''}`.trim();
  if (clientUserId) return clientUserId;
  const deviceId = `${clientMeta?.device_id || ''}`.trim();
  if (deviceId) return deviceId;
  return '';
}

function buildDivinationRiskControl({
  identityKey,
  engineVersion,
  mode,
  sceneType,
  chinaParts,
  dailyUsageCount,
  cooldownUntil,
  status = 'ok',
}) {
  return {
    is_cached: false,
    cache_key: identityKey
      ? `mingji_one_gua:${engineVersion}:${identityKey}:${mode}:${sceneType}:${buildDatetimeSlot(chinaParts, mode)}`
      : null,
    cooldown_until: cooldownUntil || null,
    daily_usage_count: dailyUsageCount,
    hourly_usage_count: null,
    status,
  };
}

function consumeXiaoLiuRenQuota({
  userKey,
  memberTier,
  engineVersion = 'v1.1',
  mode = 'current',
  sceneType = 'decision',
  eventContext,
  clientMeta = null,
}) {
  const identityKey = resolveUsageIdentity({ userKey, clientMeta });
  const chinaDateTime = `${eventContext?.eventDateTime || ''}`.trim();
  if (!identityKey || !chinaDateTime) {
    return buildDivinationRiskControl({
      identityKey,
      engineVersion,
      mode,
      sceneType,
      chinaParts: buildChinaDateParts(chinaDateTime),
      dailyUsageCount: null,
      cooldownUntil: null,
      status: 'ok',
    });
  }

  const chinaParts = buildChinaDateParts(chinaDateTime);
  const dateKey = buildChinaDateKey(chinaParts);
  const slotKey = buildDatetimeSlot(chinaParts, mode);
  const limits = getDivinationLimits(memberTier);
  const latestUsage = db.prepare(`
    SELECT requested_at
    FROM xiao_liu_ren_usage
    WHERE identity_key = ?
    ORDER BY requested_at DESC
    LIMIT 1
  `).get(identityKey);

  const dailyUsageCount = Number(db.prepare(`
    SELECT COUNT(1) AS count
    FROM xiao_liu_ren_usage
    WHERE identity_key = ? AND date_key = ?
  `).get(identityKey, dateKey)?.count || 0);

  if (latestUsage?.requested_at) {
    const latestTime = new Date(latestUsage.requested_at);
    const cooldownUntilDate = new Date(latestTime.getTime() + limits.cooldownMinutes * 60 * 1000);
    if (Date.parse(chinaDateTime) < cooldownUntilDate.getTime()) {
      const error = new Error('卦不轻起，请贰个时辰后再起');
      error.status = 429;
      error.code = 'DIVINATION_COOLDOWN';
      error.riskControl = buildDivinationRiskControl({
        identityKey,
        engineVersion,
        mode,
        sceneType,
        chinaParts,
        dailyUsageCount,
        cooldownUntil: cooldownUntilDate.toISOString(),
        status: 'cooldown',
      });
      throw error;
    }
  }

  if (dailyUsageCount >= limits.dailyLimit) {
    const error = new Error(
      limits.normalizedTier === 'member'
        ? '今日明己一卦次数已用完，请明日再来。'
        : '今日明己一卦次数已用完，请注册会员，解锁更多功能。'
    );
    error.status = 429;
    error.code = 'DIVINATION_DAILY_LIMIT';
    error.riskControl = buildDivinationRiskControl({
      identityKey,
      engineVersion,
      mode,
      sceneType,
      chinaParts,
      dailyUsageCount,
      cooldownUntil: null,
      status: 'locked',
    });
    throw error;
  }

  db.prepare(`
    INSERT INTO xiao_liu_ren_usage (
      identity_key, user_key, member_tier, engine_version, mode, scene_type,
      requested_at, date_key, slot_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    identityKey,
    `${userKey || ''}`.trim() || null,
    limits.normalizedTier,
    engineVersion,
    mode,
    sceneType,
    chinaDateTime,
    dateKey,
    slotKey
  );

  const updatedDailyUsageCount = dailyUsageCount + 1;
  const cooldownUntilDate = new Date(Date.parse(chinaDateTime) + limits.cooldownMinutes * 60 * 1000);
  return buildDivinationRiskControl({
    identityKey,
    engineVersion,
    mode,
    sceneType,
    chinaParts,
    dailyUsageCount: updatedDailyUsageCount,
    cooldownUntil: cooldownUntilDate.toISOString(),
    status: 'ok',
  });
}

function normalizeChartClues(chart = {}) {
  const concerns = [];
  const narrative = chart?.narrative || {};
  const core = `${narrative?.core_summary || chart?.coreSummary || ''}`.trim();
  const stage = `${narrative?.stage_summary || chart?.stageSummary || ''}`.trim();
  if (core) concerns.push(`命盘主线：${core}`);
  if (stage) concerns.push(`当前阶段：${stage}`);
  const actionHints = Array.isArray(narrative?.action_hints) ? narrative.action_hints : [];
  if (actionHints.length) concerns.push(`近期动作倾向：${actionHints.slice(0, 2).join('；')}`);
  return concerns.join('｜');
}

function normalizeChartCluesV2(chart = {}) {
  const concerns = [];
  const narrative = chart?.narrative || {};
  const core = `${narrative?.core_summary || chart?.coreSummary || ''}`.trim();
  const stage = `${narrative?.stage_summary || chart?.stageSummary || ''}`.trim();
  if (core) concerns.push(`命盘主线：${core}`);
  if (stage) concerns.push(`当前阶段：${stage}`);
  const actionHints = Array.isArray(narrative?.action_hints) ? narrative.action_hints : [];
  if (actionHints.length) concerns.push(`近期动作倾向：${actionHints.slice(0, 2).join('；')}`);
  return concerns.join('｜');
}

function runXiaoLiuRenEngine({
  question = '',
  sceneType,
  chart,
  mode = 'current',
  eventDateTime,
  engineVersion = 'v1.1',
  timezone = DIVINATION_TIMEZONE,
  clientMeta = null,
  module = 'mingji_one_gua',
}) {
  const resolvedSceneType = detectSceneType(question, sceneType);
  const chinaParts = buildChinaDateParts(eventDateTime);
  const chinaDateTime = buildChinaIsoString(chinaParts);
  const lunarContext = buildLunarContext(chinaParts);
  const localMonth = lunarContext.lunarMonth;
  const localDay = lunarContext.lunarDay;
  const timeBranch = getTimeBranch(chinaParts.hour);
  const config = getEngineConfig(engineVersion);
  const mainRawIndex = calculateRawIndex(localMonth, localDay, timeBranch.num);
  const secondaryRawIndex = calculateSecondaryIndex(localDay, timeBranch.num);
  const mainPalaceCode = config.palace_order[mainRawIndex];
  const secondaryPalaceCode = config.double_palace_enabled ? config.palace_order[secondaryRawIndex] : null;
  const mainPalace = getPalaceByCode(engineVersion, mainPalaceCode);
  const secondaryPalace = secondaryPalaceCode ? getPalaceByCode(engineVersion, secondaryPalaceCode) : null;
  const sceneMapping = getSceneMapping(resolvedSceneType, mainPalaceCode);
  const comboMapping = secondaryPalaceCode ? getDoubleMapping(mainPalaceCode, secondaryPalaceCode) : null;
  const sceneStandardPacket = buildSceneStandardPacket(
    resolvedSceneType,
    SCENE_FALLBACKS[resolvedSceneType] || resolvedSceneType,
    mainPalace,
    sceneMapping
  );
  const doublePalaceResult = buildDoublePalacePacket(mainPalace, secondaryPalace, comboMapping);
  const riskConfig = db.prepare(`
    SELECT *
    FROM risk_control_config
    WHERE engine_version = ? AND mode = ? AND status = 1
    LIMIT 1
  `).get(engineVersion, mode);

  const requestId = createRequestId();
  const timestamp = new Date().toISOString();
  const cacheKey = clientMeta?.user_id
    ? `${module}:${engineVersion}:${clientMeta.user_id}:${mode}:${resolvedSceneType}:${buildDatetimeSlot(chinaParts, mode)}`
    : null;

  const normalizedResult = {
    palace_code: mainPalace?.palace_code || '',
    palace_name: mainPalace?.palace_name || '',
    fortune_level: sceneStandardPacket?.fortune_level || mainPalace?.fortune_level || '',
    scene_judgment: sceneStandardPacket?.judgment || '',
    recommended: (sceneStandardPacket?.recommended || []).slice(0, 4),
    avoid: (sceneStandardPacket?.avoid || []).slice(0, 4),
    short_output: sceneStandardPacket?.short_output || '',
    one_line_summary: mainPalace?.summary || '',
  };

  const normalizedPayload = {
    module,
    engine: 'xiao_liu_ren',
    engine_version: engineVersion,
    mode,
    scene_type: resolvedSceneType,
    request_id: requestId,
    timestamp,
    query_context: {
      timezone: DIVINATION_TIMEZONE,
      datetime: eventDateTime || chinaDateTime,
    },
    calc_context: {
      lunar_month: localMonth,
      lunar_day: localDay,
      time_branch_name: timeBranch.branch,
      time_branch_index: timeBranch.num,
      formula: config.formula,
      raw_index: mainRawIndex,
    },
    result: normalizedResult,
    risk_control: {
      is_cached: false,
      cache_key: cacheKey,
      cooldown_until: null,
      daily_usage_count: null,
      hourly_usage_count: null,
      status: 'ok',
    },
    ui_hints: {
      display_style: 'single_card',
      show_traditional_name: true,
      show_fortune_level: true,
      primary_button: '再看一件事',
      secondary_button: '稍后再看',
    },
    double_palace_result: doublePalaceResult,
  };

  return {
    module,
    engineVersion,
    engineName: config.engine_name,
    mode,
    sceneType: resolvedSceneType,
    sceneName: SCENE_FALLBACKS[resolvedSceneType] || resolvedSceneType,
    question: `${question || ''}`.trim(),
    likelyConcern: pickLikelyConcern(resolvedSceneType),
    chartClues: normalizeChartCluesSafe(chart),
    eventContext: {
      localMonth,
      localDay,
      localHour: chinaParts.hour,
      timeBranch: timeBranch.branch,
      timeBranchNumber: timeBranch.num,
      eventDateTime: chinaDateTime,
      timezoneUsed: DIVINATION_TIMEZONE,
    },
    mainPalace,
    secondaryPalace,
    sceneMapping,
    sceneStandardPacket,
    comboMapping,
    doublePalaceResult,
    riskConfig: riskConfig || null,
    summary: comboMapping?.short_output || sceneMapping?.short_output || mainPalace?.summary || '',
    recommended: Array.from(new Set([
      ...(comboMapping?.recommended || []),
      ...(sceneMapping?.recommended || []),
      ...(mainPalace?.recommended || []),
    ])).slice(0, 6),
    avoid: Array.from(new Set([
      ...(comboMapping?.avoid || []),
      ...(sceneMapping?.avoid || []),
      ...(mainPalace?.avoid || []),
    ])).slice(0, 6),
    requestId,
    normalizedPayload,
  };
}

module.exports = {
  consumeXiaoLiuRenQuota,
  runXiaoLiuRenEngine,
};

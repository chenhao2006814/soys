const supabaseUrl = "https://lzaidqtldgxhauwssslz.supabase.co";
const supabaseAnonKey = "sb_publishable_323LjUfcN75yOBZzS7mJVg_ejjFic3t";
let supabase = null;
const debugBox = document.getElementById('debugBox');

function logText(msg) {
    const t = new Date().toLocaleTimeString();
    debugBox.innerText += `[${t}] ${msg}\n`;
    debugBox.scrollTop = debugBox.scrollHeight;
}

window.onerror = function (message) {
    logText("❌全局JS异常:" + message);
};

logText("等待Supabase SDK加载");
try {
    if (typeof window.supabase !== "undefined") {
        logText("✅ Supabase SDK加载完毕");
        supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
    } else {
        logText("❌ Supabase SDK未加载，检查supabase.js");
    } catch (err) {
        logText("❌初始化失败:" + err.message);
    }
}

// Cookie工具
function setCookie(name, value, day) {
    const d = new Date();
    d.setTime(d.getTime() + day * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${value};expires=${d.toUTCString()};path=/`;
}

function getCookie(name) {
    const arr = document.cookie.match(new RegExp("(^| )" + name + "=([^;]*)(;|$)"));
    return arr ? arr[2] : null;
}

let vid = getCookie('vid');
if (!vid) {
    vid = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    setCookie('vid', vid, 1);
}

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const pageStart = performance.now();

let sourceList = [];
let isAdmin = false;
let currentCat = "video";
let dragState = { active: false, fromIdx: null, ghostEl: null, startX: 0, startY: 0 };

const kwInput = $('#kw');
const clearKw = $('#clearKw');
const sourceGrid = $('#sourceGrid');
const sourceManageBtn = $('#sourceManageBtn');
const adminLoginBtn = $('#adminLoginBtn');
const addMask = $('#addMask');
const loginMask = $('#loginMask');
const editMask = $('#editMask');
const toast = $('#toast');
const addLimitTip = $('#addLimitTip');
const visitorTxt = $('#visitorTxt');
const addTotalTxt = $('#addTotalTxt');
const loadTxt = $('#loadTxt');
const bodyEl = document.body;
const hamburgerBtn = $('#hamburgerBtn');
const catDropdown = $('#catDrop');
const addSourceType = $('#addSourceType');
const editSourceType = $('#editSourceType');
const adminPwd = $('#adminPwd');
const pwdEye = $('#pwdEye');
const searchBtn = $('#searchBtn');

function showToast(txt) {
    toast.textContent = txt;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1800);
}

function getDomain(url) {
    try {
        const u = new URL(url);
        return u.hostname.replace('www.', '');
    } catch { return ''; }
}

function doCardJump(item, keyword = "") {
    const kw = keyword || kwInput.value.trim();
    if (kw) {
        const link = item.search.replaceAll('{kw}', encodeURIComponent(kw));
        window.open(link, '_blank');
    } else {
        window.open(item.url, '_blank');
    }
}

searchBtn.onclick = () => {
    const kw = kwInput.value.trim();
    if (!kw) {
        showToast("请输入搜索关键词");
        return;
    }
    const filtered = sourceList.filter(i => (i.category || "video") === currentCat);
    filtered.forEach(item => doCardJump(item, kw));
};

function refreshCatActive() {
    $$('.category-item').forEach(el => {
        el.classList.toggle('active', el.dataset.type === currentCat);
    })
}

hamburgerBtn.addEventListener('click', e => {
    e.stopPropagation();
    catDropdown.classList.toggle('open');
});
document.addEventListener('click', () => catDropdown.classList.remove('open'));

$$('.category-item').forEach(item => {
    item.addEventListener('click', e => {
        e.stopPropagation();
        currentCat = item.dataset.type;
        refreshCatActive();
        renderList();
        catDropdown.classList.remove('open');
    });
});

kwInput.addEventListener('input', () => {
    clearKw.classList.toggle('show', kwInput.value.trim() !== '');
})
clearKw.onclick = () => {
    kwInput.value = '';
    clearKw.classList.remove('show');
    kwInput.focus();
};

pwdEye.onclick = () => {
    adminPwd.type = adminPwd.type === 'password' ? 'text' : 'password';
    pwdEye.textContent = adminPwd.type === 'password' ? '👁' : '🙈';
}

async function loadSourceData() {
    let retry = 0;
    const maxRetry = 2;
    while (retry <= maxRetry) {
        try {
            const { data, error } = await supabase
                .from('vod_source')
                .select('*')
                .order('sort', { ascending: true });
            if (error) throw error;
            sourceList = data || [];
            renderList();
            logText(`加载完成，共${data.length}条源`);
            return;
        } catch (e) {
            retry++;
            logText(`读取源失败，重试${retry}/${maxRetry}: ${e.message}`);
            if (retry > maxRetry) logText("读取源彻底失败:" + e);
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }
}

async function saveSortAfterChange() {
    logText("拖拽保存排序");
    for (let i = 0; i < sourceList.length; i++) {
        const item = sourceList[i];
        const { error } = await supabase.from('vod_source').update({ sort: i }).eq("id", item.id);
        if (error) logText("排序保存失败:" + error.message);
    }
    showToast("排序已保存");
}

async function loadVisitorCount(vidVal) {
    const today = new Date().toISOString().slice(0, 10);
    logText(`查询访客计数 vid=${vidVal}, date=${today}`);
    try {
        const { data, error } = await supabase
            .from('visitor_count')
            .select('*')
            .eq('visitor_id', vidVal)
            .eq('add_date', today)
            .limit(1);
        if (error) {
            logText("访客查询异常:" + error.message);
            return;
        }
        if (!data || data.length === 0) {
            await supabase.from('visitor_count').insert([{ visitor_id: vidVal, add_date: today, add_num: 0 }]);
            visitorTxt.innerText = `今日访客：1人`;
            addTotalTxt.innerText = `游客今日新增源：0`;
        } else {
            visitorTxt.innerText = `今日访客：1人`;
            addTotalTxt.innerText = `游客今日新增源：${data[0].add_num}`;
        }
    } catch (err) {
        logText("访客统计异常:" + err.message);
    }
}

async function addSourceApi(payload) {
    const today = new Date().toISOString().slice(0, 10);
    if (!payload.isAdmin) {
        const { data: row, error: errCnt } = await supabase
            .from("visitor_count")
            .select("add_num")
            .eq("visitor_id", payload.vid)
            .eq("add_date", today)
            .single();
        if (errCnt && errCnt.code !== 'PGRST116') return { code: -1, msg: "获取次数失败" };
        const num = row?.add_num || 0;
        if (num >= 5) return { code: -1, msg: "今日添加已达上限5次" };
    }
    const { error } = await supabase.from('vod_source').insert({
        name: payload.name,
        url: payload.home,
        search: payload.search,
        category: payload.type,
        from_visitor: !payload.isAdmin,
        sort: sourceList.length
    });
    if (!payload.isAdmin && !error) {
        const { data: row } = await supabase.from("visitor_count")
            .select("add_num")
            .eq("visitor_id", payload.vid)
            .eq("add_date", today)
            .single();
        if (row) {
            await supabase.from("visitor_count").update({ add_num: row.add_num + 1 })
                .eq("visitor_id", payload.vid).eq("add_date", today);
        } else {
            await supabase.from("visitor_count").insert({ visitor_id: payload.vid, add_date: today, add_num: 1 });
        }
    }
    if (error) {
        logText(`新增源异常:${error.message}`);
        return { code: -1, msg: error.message };
    }
    logText("新增源成功");
    return { code: 0 };
}

async function editSourceApi(dbId, payload) {
    const { data: oldItem } = await supabase.from('vod_source')
        .select("from_visitor").eq("id", dbId).single();
    const { error } = await supabase.from('vod_source').update({
        name: payload.name,
        url: payload.home,
        search: payload.search,
        category: payload.type,
        from_visitor: oldItem.from_visitor
    }).eq("id", dbId);
    if (error) {
        logText(`编辑异常:${error.message}`);
        return { code: -1, msg: error.message };
    }
    return { code: 0 };
}

async function delSourceApi(dbId) {
    const { error } = await supabase.from('vod_source').delete().eq("id", dbId);
    if (error) {
        logText(`删除异常:${error.message}`);
        return { code: -1, msg: error.message };
    }
    return { code: 0 };
}

async function checkAdminPwd(inputPwd) {
    const { data } = await supabase.from("admin_config").select("pwd").single();
    return data?.pwd === inputPwd;
}

function renderList() {
    logText("执行renderList渲染卡片");
    sourceGrid.innerHTML = '';
    const filtered = sourceList.filter(item => (item.category || "video") === currentCat);
    filtered.forEach((item) => {
        const realIdx = sourceList.indexOf(item);
        const card = document.createElement('div');
        card.className = 'source-card';
        card.dataset.idx = realIdx;
        card.dataset.dbid = item.id;
        card.innerHTML = `<div class="card-name">${item.name}${item.from_visitor === true ? '<span class="visitor-tag">(游)</span>' : ''}</div><div class="card-ops"><button class="opt-btn edit" data-idx="${realIdx}" data-dbid="${item.id}">编辑</button><button class="opt-btn del" data-idx="${realIdx}" data-dbid="${item.id}">删除</button></div>`;

        const editBtn = card.querySelector('.edit');
        const delBtn = card.querySelector('.del');
        const opsWrap = card.querySelector('.card-ops');
        let longPressTimer = null;
        let touchStartX = 0, touchStartY = 0;

        card.addEventListener('touchstart', (e) => {
            if (!isAdmin) return;
            const touch = e.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            longPressTimer = setTimeout(() => {
                e.preventDefault();
                dragState.active = true;
                dragState.fromIdx = realIdx;
                dragState.startX = touch.clientX;
                dragState.startY = touch.clientY;
                const ghost = document.createElement('div');
                ghost.className = "drag-ghost";
                ghost.innerText = item.name;
                document.body.appendChild(ghost);
                dragState.ghostEl = ghost;
                ghost.style.left = touch.clientX + 'px';
                ghost.style.top = touch.clientY + 'px';
                card.classList.add('dragging');
                bodyEl.classList.add('drag-lock');
                showToast("已激活拖拽，拖动换位");
            }, 600);
        });
        card.addEventListener('contextmenu', e => { if (isAdmin) e.preventDefault(); });
        card.addEventListener('touchmove', (e) => {
            if (!isAdmin) return;
            const touch = e.touches[0];
            const dx = touch.clientX - touchStartX;
            const dy = touch.clientY - touchStartY;
            if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clearTimeout(longPressTimer);
            if (!dragState.active) return;
            e.preventDefault();
            dragState.ghostEl.style.left = touch.clientX + 'px';
            dragState.ghostEl.style.top = touch.clientY + 'px';
            const cards = $$('.source-card');
            for (let c of cards) {
                const rect = c.getBoundingClientRect();
                if (touch.clientX >= rect.left && touch.clientX <= rect.right && touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
                    const targetIdx = Number(c.dataset.idx);
                    if (targetIdx !== dragState.fromIdx) {
                        const temp = sourceList[dragState.fromIdx];
                        sourceList.splice(dragState.fromIdx, 1);
                        sourceList.splice(targetIdx, 0, temp);
                        dragState.fromIdx = targetIdx;
                        renderList();
                    }
                    break;
                }
            }
        });
        card.addEventListener('touchend', () => {
            clearTimeout(longPressTimer);
            if (!dragState.active) return;
            dragState.active = false;
            if (dragState.ghostEl) { dragState.ghostEl.remove(); dragState.ghostEl = null; }
            card.classList.remove('dragging');
            bodyEl.classList.remove('drag-lock');
            saveSortAfterChange();
        });
        card.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isAdmin) {
                $$('.card-ops').forEach(op => op.classList.remove('show'));
                opsWrap.classList.add('show');
            } else {
                doCardJump(item);
            }
        });
        card.addEventListener('dblclick', () => doCardJump(item));

        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const i = Number(editBtn.dataset.idx);
            const data = sourceList[i];
            $('#editDbId').value = data.id;
            $('#editName').value = data.name;
            $('#editHome').value = data.url;
            $('#editSearch').value = data.search;
            editSourceType.value = data.category || "video";
            editMask.classList.add('open');
        });
        delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const dbId = Number(delBtn.dataset.dbid);
            if (!confirm("确定删除该搜索源吗？")) return;
            const ret = await delSourceApi(dbId);
            if (ret.code === 0) {
                showToast('已删除');
                await loadSourceData();
                await loadVisitorCount(vid);
            } else {
                showToast(ret.msg);
            }
        });
        sourceGrid.appendChild(card);
    })
}

sourceManageBtn.onclick = async () => {
    addLimitTip.textContent = "正在获取剩余次数...";
    $('#addName').value = ""; $('#addHome').value = ""; $('#addSearch').value = "";
    addSourceType.value = currentCat;
    addMask.classList.add('open');
    $('#confirmAdd').disabled = false;
    addLimitTip.textContent = isAdmin ? "今日剩余添加：无限制" : "今日剩余添加：5次";
}
$('#cancelAdd').onclick = () => addMask.classList.remove('open');
$('#cancelLogin').onclick = () => loginMask.classList.remove('open');
$('#cancelEdit').onclick = () => editMask.classList.remove('open');

$('#confirmAdd').onclick = async () => {
    const name = $('#addName').value.trim();
    const home = $('#addHome').value.trim();
    const search = $('#addSearch').value.trim();
    const typeVal = addSourceType.value;
    if (!name || !home || !search) return showToast('所有内容不能为空');
    if (!/^https?:\/\//.test(home)) return showToast('首页地址必须http/https开头');
    if (!/^https?:\/\//.test(search)) return showToast('搜索地址必须http/https开头');
    if (sourceList.some(x => x.name === name)) return showToast('源名称不能重复');
    const dHome = getDomain(home);
    const dSearch = getDomain(search);
    const domainRepeat = sourceList.some(x => {
        const dh = getDomain(x.url);
        const ds = getDomain(x.search);
        return dh === dHome || dh === dSearch || ds === dHome || ds === dSearch;
    });
    if (domainRepeat) return showToast("该域名已经存在，不能重复添加");
    const payload = { name, home, search, type: typeVal, vid, isAdmin };
    const ret = await addSourceApi(payload);
    if (ret.code !== 0) return showToast(ret.msg);
    addMask.classList.remove('open');
    showToast("添加成功");
    await loadSourceData();
    await loadVisitorCount(vid);
}

adminLoginBtn.onclick = async () => {
    if (isAdmin) {
        isAdmin = false;
        adminLoginBtn.textContent = '游客';
        $$('.card-ops').forEach(op => op.classList.remove('show'));
        showToast("已退出管理员");
        await loadSourceData();
    } else {
        loginMask.classList.add('open');
        adminPwd.value = "";
        pwdEye.textContent = '👁';
        adminPwd.type = 'password';
    }
}

$('#confirmLogin').onclick = async () => {
    const pwd = adminPwd.value.trim();
    const ok = await checkAdminPwd(pwd);
    if (ok) {
        isAdmin = true;
        adminLoginBtn.textContent = '管理员';
        loginMask.classList.remove('open');
        renderList();
        showToast("管理员登录成功");
        await loadSourceData();
    } else {
        showToast("密码错误");
    }
}

$('#confirmEdit').onclick = async () => {
    const dbId = Number($('#editDbId').value);
    const name = $('#editName').value.trim();
    const home = $('#editHome').value.trim();
    const search = $('#editSearch').value.trim();
    const typeVal = editSourceType.value;
    if (!name || !home || !search) return showToast("内容不能为空");
    if (!/^https?:\/\//.test(home)) return showToast("首页地址http/https开头");
    if (!/^https?:\/\//.test(search)) return showToast("搜索地址http/https开头");
    const payload = { name, home, search, type: typeVal };
    const ret = await editSourceApi(dbId, payload);
    if (ret.code === 0) {
        editMask.classList.remove('open');
        showToast("保存成功");
        await loadSourceData();
    } else {
        showToast(ret.msg);
    }
}

window.addEventListener('load', async () => {
    logText("页面load事件触发");
    const cost = ((performance.now() - pageStart) / 1000).toFixed(2);
    loadTxt.textContent = `页面加载：${cost}s`;
    refreshCatActive();
    if (supabase) {
        await loadSourceData();
        await loadVisitorCount(vid);
    } else {
        logText("Supabase实例不存在，跳过数据加载");
    }
});

const positive = v => typeof v === 'number' && v > 0 ? v : null;
const clone = value => structuredClone(value);
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function normalizeEntry(raw) {
  const e = raw.extensions || {};
  const result = {
    uid:raw.id, name:raw.comment || '', enabled:raw.enabled !== false, content:raw.content,
    strategy:{ type:raw.constant ? 'constant' : e.vectorized ? 'vectorized' : 'selective', keys:raw.keys || [], keys_secondary:{ logic:['and_any','not_all','not_any','and_all'][e.selectiveLogic || 0], keys:raw.secondary_keys || [] }, scan_depth:e.scan_depth ?? 'same_as_global' },
    position:{ type:['before_character_definition','after_character_definition','before_author_note','after_author_note','at_depth','before_example_messages','after_example_messages','outlet'][e.position ?? (raw.position === 'after_char' ? 1 : 0)], role:['system','user','assistant'][e.role || 0], depth:e.depth ?? 4, order:raw.insertion_order ?? 100 },
    probability:e.useProbability === false ? 100 : e.probability ?? 100,
    recursion:{ prevent_incoming:!!e.exclude_recursion, prevent_outgoing:!!e.prevent_recursion, delay_until:positive(e.delay_until_recursion) },
    effect:{ sticky:positive(e.sticky),cooldown:positive(e.cooldown),delay:positive(e.delay) },
  };
  const implicit = {group:'group',group_override:'groupOverride',group_weight:'groupWeight',case_sensitive:'caseSensitive',match_whole_words:'matchWholeWords',use_group_scoring:'useGroupScoring',automation_id:'automationId',ignore_budget:'ignoreBudget',outlet_name:'outletName',triggers:'triggers',match_persona_description:'matchPersonaDescription',match_character_description:'matchCharacterDescription',match_character_personality:'matchCharacterPersonality',match_character_depth_prompt:'matchCharacterDepthPrompt',match_scenario:'matchScenario',match_creator_notes:'matchCreatorNotes'};
  for (const [from,to] of Object.entries(implicit)) if (Object.hasOwn(e,from)) result[to] = clone(e[from]);
  return result;
}

function mergeObject(local,base,remote,path,conflicts) {
  const out = clone(local);
  for (const key of new Set([...Object.keys(base),...Object.keys(remote)])) {
    // Activation is a player preference, even when the author changes the default.
    if (key === 'enabled' || key === 'uid' || key === 'id' || key === 'extra') continue;
    const name = `${path}.${key}`;
    if (canonical(base[key]) === canonical(remote[key])) continue;
    if (canonical(local[key]) === canonical(base[key])) {
      if (Object.hasOwn(remote,key)) out[key] = clone(remote[key]); else delete out[key];
    } else if (canonical(local[key]) !== canonical(remote[key])) {
      if (local[key] && base[key] && remote[key] && !Array.isArray(remote[key]) && typeof remote[key] === 'object') out[key] = mergeObject(local[key],base[key],remote[key],name,conflicts);
      else conflicts.push(name);
    }
  }
  return out;
}

/** Three-way author updates. Unrelated entries, local edits and local deletions survive. */
export function mergeEntries(current,baseline,incoming,{id='uid',name='name'}={}) {
  const result = clone(current); const conflicts = [];
  for (const next of incoming) {
    const before = baseline.find(e => e[id] === next[id]);
    const index = result.findIndex(e => e[id] === next[id] && (e[name] === before?.[name] || e[name] === next[name]));
    if (!before) {
      if (result.some(e=>e[id] === next[id] || e[name] === next[name])) { conflicts.push(`${next[name]}:新增条目冲突`); continue; }
      result.push(clone(next)); continue;
    }
    if (index < 0) { conflicts.push(`${next[name]}:本地已删除或改名`); continue; }
    result[index] = mergeObject(result[index],before,next,String(next[name]),conflicts);
  }
  // Retired entries are kept disabled only if unchanged, rather than deleting player material.
  for (const before of baseline) {
    if (incoming.some(e=>e[id] === before[id])) continue;
    const item = result.find(e=>e[id] === before[id] && e[name] === before[name]);
    if (item && canonical({...item,enabled:before.enabled}) === canonical(before)) item.enabled = false;
  }
  return { entries:result,conflicts };
}

export async function updateContent({api,store,content,baseline,identity,isCurrent}) {
  const ensure = () => { if (!isCurrent()) throw new DOMException('聊天已经改变，取消更新','AbortError'); };
  ensure();
  const binding = api.getCharWorldbookNames('current');
  if (!binding.primary) return { conflicts:['当前角色未绑定内置世界书，请先导入角色卡世界书'],commit:async()=>{},rollback:async()=>{} };
  const book = binding.primary;
  const key = `content:${identity}:${book}`;
  const journalKey = `pending:${key}`;
  // Some SillyTavern imports keep the binding but don't extract the embedded book.
  // Only create a missing book: never replace an existing book wholesale.
  if (api.getWorldbookNames && !api.getWorldbookNames().includes(book)) {
    ensure();
    await api.createWorldbook(book,baseline.worldbook.entries.map(normalizeEntry));
    ensure();
  }
  const recover = async journal => {
    if (!journal) return;
    // Explicit book name allows recovery even after the user switches chat.
    await api.updateWorldbookWith(book,current => mergeEntries(current,journal.applied,journal.prior).entries);
    await store.set(key,journal.last);
    await store.set(journalKey,null);
  };
  await recover(await store.get(journalKey));
  ensure();
  const last = await store.get(key);
  if (last?.version === content.version) return {conflicts:[],commit:async()=>{},rollback:async()=>{}};
  const original = last?.entries || baseline.worldbook.entries.map(normalizeEntry);
  const incoming = content.worldbook.entries.map(normalizeEntry);
  const conflicts = [];
  let journal;
  try {
    ensure();
    await api.updateWorldbookWith(book, async current => {
      ensure();
      const merged = mergeEntries(current,original,incoming);
      conflicts.push(...merged.conflicts);
      journal = {book,prior:clone(current),applied:clone(merged.entries),last:last || {version:'5.20',entries:original}};
      await store.set(`backup:${identity}:${Date.now()}`,journal);
      await store.set(journalKey,journal);
      ensure(); return merged.entries;
    });
    ensure();
    return {
      conflicts,
      commit:async()=>{
        ensure();
        await store.set(key,{version:content.version,entries:incoming});
        await store.set(journalKey,null);
      },
      rollback:()=>recover(journal),
    };
  } catch(error) {
    if (journal) await recover(journal);
    throw error;
  }
}

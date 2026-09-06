(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  else root.LipsVoiceCleanup = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  const FILLERS = new Set(['um','umm','ummm','uh','uhh','uhhh','erm','ermm','hmm','hmmm','mmm','mmmm']);

  function tidySpacing(text){
    return String(text || '')
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/([,.;:!?])(?=[A-Za-z0-9])/g, '$1 ')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\s*\n\s*/g, '\n')
      .trim();
  }

  function collapseImmediateRepeats(text){
    let out = String(text || '');
    let collapsed = 0;
    // Collapse repeated short phrases first: "he has he has", "the patient the patient".
    for(let pass = 0; pass < 2; pass++){
      out = out.replace(/\b([A-Za-z][A-Za-z'’-]*\s+[A-Za-z][A-Za-z'’-]*)\b(?:[\s,]+\1\b)+/gi, match => {
        const first = match.match(/^\s*([A-Za-z][A-Za-z'’-]*\s+[A-Za-z][A-Za-z'’-]*)/i)?.[1] || match;
        collapsed += 1;
        return first;
      });
    }
    // Collapse single-word stutters/repeats: "he he he", "and and", "pain, pain".
    out = out.replace(/\b([A-Za-z][A-Za-z'’-]*)\b(?:[\s,]+\1\b){1,5}/gi, (_match, word) => {
      collapsed += 1;
      return word;
    });
    return { text: out, collapsed };
  }

  function removeFillers(text){
    const parts = String(text || '').split(/(\s+|[,.;:!?])/);
    let removed = 0;
    const kept = [];
    for(let i = 0; i < parts.length; i++){
      const part = parts[i];
      const normalized = part.toLowerCase().replace(/[^a-z]/g, '');
      if(FILLERS.has(normalized)){
        removed += 1;
        // Drop an immediately following comma/space artifact as well.
        while(i + 1 < parts.length && /^(?:\s+|,)$/.test(parts[i + 1])) i += 1;
        if(kept.length && !/\s$/.test(kept[kept.length - 1])) kept.push(' ');
        continue;
      }
      kept.push(part);
    }
    return { text: kept.join(''), removed };
  }

  function cleanTranscriptDetailed(text){
    const original = String(text || '').trim();
    if(!original) return { text: '', removedFillers: 0, collapsedRepeats: 0, changed: false };
    const fillerPass = removeFillers(original);
    const repeatPass = collapseImmediateRepeats(fillerPass.text);
    const cleaned = tidySpacing(repeatPass.text);
    return {
      text: cleaned,
      removedFillers: fillerPass.removed,
      collapsedRepeats: repeatPass.collapsed,
      changed: cleaned !== original
    };
  }

  function cleanTranscript(text){ return cleanTranscriptDetailed(text).text; }

  return { cleanTranscript, cleanTranscriptDetailed };
});

(function(){
  var sel=document.getElementById('themeSelect');
  sel.value=document.documentElement.dataset.theme;
  if(sel.value!==document.documentElement.dataset.theme)sel.value='navy';
  sel.addEventListener('change',function(){
    document.documentElement.dataset.theme=sel.value;
    try{localStorage.setItem('assa_theme',sel.value)}catch(e){}
    var m=document.querySelector('meta[name=theme-color]');
    if(m)m.content=getComputedStyle(document.documentElement).getPropertyValue('--theme-bar').trim()||'#1b3a6b';
  });
})();

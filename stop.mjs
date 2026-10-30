const origin='http://127.0.0.1:8780';try{await fetch(origin+'/shutdown',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});}catch{}

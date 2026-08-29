/* ============================================================================
   QA · CROSS-SCREEN PAIR CONSISTENCY                     node scripts/qa/…  .
   ----------------------------------------------------------------------------
   A pending match is shown TWICE — read-only on Identity Records (#17475) and
   adjudicable on the Pending Match Queue (#17515) — from two fixtures that were
   written independently. When they disagree the demo looks broken: the same
   pair, opened two ways, describes two different people.

   This walks every pair an operator can actually reach (the 14 DIRECTORY
   people behind the Natural Persons list, plus the Byrne fixture) and asserts
   the two screens agree on:

     · candidate and established names
     · every comparison row — field, both values, and the verdict
     · matched keys, the refusal reason, and the refused date
     · the date echoed in the candidate card's meta line

   Exits non-zero on any drift, so it can gate a handoff.

   RUN IT AFTER TOUCHING EITHER DATA FILE. The queue's rows carry a `compare`
   array harvested from the identities service precisely so this stays true;
   editing one side without the other is what it exists to catch.
   ========================================================================= */

var fs=require("fs"), path=process.argv[2] || ".";
var isrc=fs.readFileSync(path+"/js/pages/pge-admin-natprsn-identities.data.js","utf8");
var i=isrc.indexOf("var DIRECTORY = ["), j=isrc.indexOf("\n  ];", i);
var DIRECTORY=eval(isrc.slice(i+"var DIRECTORY = ".length, j+4));
global.window={CaseFusion:{}}; global.document={addEventListener:function(){}};
eval(fs.readFileSync(path+"/js/pages/pge-admin-natprsn-queue.data.js","utf8"));
var qsvc=window.CaseFusion.PendingMatchService;
var V={ "Matches":"match","Differs":"differ","One Side":"missing","Expected":"missing" };
function check(search){
  global.window={CaseFusion:{}, location:{search:search}};
  global.document={addEventListener:function(){}};
  eval(isrc);
  var isvc=window.CaseFusion.NaturalPersonService;
  return Promise.all([isvc.person(), isvc.candidates({page:1,pageSize:100,search:"",sort:"",dir:"desc"})])
   .then(function(r){ var p=r[0];
    return Promise.all(r[1].rows.map(function(row){
      return isvc.candidate(row.id).then(function(ic){
        return qsvc.resolvePair({pair:ic.id, est:p.name, cand:ic.name}).then(function(res){
          if(!res.id) return {pair:p.name+" / "+ic.name, err:"unresolved in the queue"};
          return Promise.all([qsvc.pair(res.id), qsvc.comparison(res.id)]).then(function(q){
            var qp=q[0], qc=q[1], d=[];
            ic.compare.forEach(function(x,k){ var e=qc[k]; if(!e){d.push(x.field+" absent");return;}
              var icd = x.candidate==="—"?null:x.candidate;
              if(e.field!==x.field) d.push("field order");
              if(String(e.established)!==String(x.person)) d.push(x.field+" established");
              if(String(e.distinct)!==String(icd)) d.push(x.field+" candidate");
              if(e.verdict!==V[x.agree]) d.push(x.field+" verdict"); });
            if(qc.length!==ic.compare.length) d.push("row count");
            if((qp.matchedOn||[]).join()!==ic.matchedOn.join()) d.push("matchedOn");
            if(qp.reason!==ic.reason) d.push("reason");
            if(qp.refusedOn!==ic.flagged) d.push("date "+ic.flagged+"/"+qp.refusedOn);
            if(qp.candidateMeta.indexOf(ic.flagged)===-1) d.push("candidateMeta date");
            if(qp.candidate!==ic.name) d.push("candidate name");
            if(qp.established!==p.name) d.push("established name");
            return {pair:p.name+" / "+ic.name, diffs:d};
          });
        });
      });
    }));
   });
}
var jobs=DIRECTORY.map(function(d){return check("?personId="+d.id);}); jobs.push(check(""));
Promise.all(jobs).then(function(all){
  var f=[].concat.apply([],all), bad=f.filter(function(x){return x.err||(x.diffs&&x.diffs.length);});
  console.log("pairs compared:", f.length, "| AGREE:", f.length-bad.length, "| DRIFT:", bad.length);
  bad.forEach(function(b){ console.log("   "+b.pair+" :: "+(b.err||b.diffs.join(", "))); });
  process.exit(bad.length ? 1 : 0);
});

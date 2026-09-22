import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
const app=path.resolve('.build-src/letmefly_app')
const data=JSON.parse(fs.readFileSync(path.join(app,'dist/data/exercise-intelligence-v1.json')))
const names=new Map()
for(const exercise of data.exercises)for(const name of [exercise.canonicalName,...exercise.aliases||[]])names.set(name.toLowerCase(),exercise)
const window={LetMeFlyExerciseIntelligence:{getExercise:name=>names.get(name.toLowerCase())}}
vm.runInNewContext(fs.readFileSync('overlays/ui-command-v2/batch-v/exercise-presentation-v1.js','utf8'),{window})
const classify=window.LetMeFlyExercisePresentation.classify
for(const exercise of data.exercises){
  if(exercise.equipment.length && !exercise.equipment.includes('Barbell'))assert.equal(classify(exercise.canonicalName).barbell,false,exercise.canonicalName+' must not show barbell tools')
  if(exercise.equipment.length===1 && exercise.equipment[0]==='Barbell')assert.equal(classify(exercise.canonicalName).barbell,true,exercise.canonicalName+' must retain barbell tools')
}
for(const name of ['Goblet Squat','Belt Squat','DB Bench Press','Dumbbell RDL','Smith Squat','Landmine Press','Split Squat','Cable Pull-Through','Bike / Incline Walk','Pull-Up or Lat Pulldown'])assert.equal(classify(name).barbell,false,name)
for(const name of ['Front Squat Governed Attempts','Back Squat Governed Attempts','Bench Press Governed Attempts','Deadlift Governed Attempts','Close-Grip/Pause Bench Press','JM Press','Box Squat','Snatch-Grip RDL'])assert.equal(classify(name).barbell,true,name)
assert.equal(classify('Lateral Raise').dumbbell,false,'Mixed-equipment movement does not assume dumbbells')
assert.equal(classify('Lateral Raise','15 lb DBs').dumbbell,true,'Explicit prescription establishes dumbbells')
const {build}=await import(pathToFileURL(path.join(app,'node_modules/vite/dist/node/index.js')))
const temp=fs.mkdtempSync(path.join(app,'.qa-presentation-'))
try{
  await build({configFile:false,logLevel:'error',build:{outDir:temp,emptyOutDir:true,lib:{entry:path.join(app,'src/programs/registry.ts'),formats:['es'],fileName:()=> 'programs.mjs'},minify:false}})
  const {PROGRAMS}=await import(pathToFileURL(path.join(temp,'programs.mjs')))
  const report={catalog:data.exercises.length,programs:{},movements:{}}
  for(const p of PROGRAMS){
    const stats={weeks:p.weekData.length,days:0,exerciseCards:0,sets:0}
    for(const w of p.weekData)for(const d of w.days){stats.days++;for(const s of d.sections)for(const e of s.exercises){stats.exerciseCards++;stats.sets+=e.sets.length;report.movements[e.name]=classify(e.name,e.sets.map(s=>s.loadText||'').join(' '))}}
    report.programs[p.key]=stats
  }
  const out=path.join(app,'BROWSER_SMOKE_AUDIT');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'exercise-presentation.json'),JSON.stringify(report,null,2))
  console.log('PASS exercise presentation catalog and all-program coverage',JSON.stringify(report.programs))
}finally{fs.rmSync(temp,{recursive:true,force:true})}

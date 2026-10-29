let patients=[];
let lastSchedule=[];

function escapeHtml(v){return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function addPatient(){const patient_id=document.getElementById("patientId").value.trim();const priority=document.getElementById("priority").value;const arrival_time=Number(document.getElementById("arrivalTime").value);const scan_duration=Number(document.getElementById("scanDuration").value);if(!patient_id)return showError("Enter a Patient ID.");if(patients.some(p=>p.patient_id===patient_id))return showError("That Patient ID already exists.");if(arrival_time<0)return showError("Arrival time must be 0 or greater.");if(scan_duration<1||scan_duration>45)return showError("Scan duration must be between 1 and 45 minutes.");patients.push({patient_id,priority,arrival_time,scan_duration});document.getElementById("patientId").value="";renderPatients();clearError()}
function removePatient(i){patients.splice(i,1);renderPatients()}
function renderPatients(){const tbody=document.querySelector("#patientTable tbody");const now=Number(document.getElementById("currentTime").value||0);tbody.innerHTML=patients.map((p,i)=>`<tr><td><strong>${escapeHtml(p.patient_id)}</strong></td><td>${escapeHtml(p.priority)}</td><td>${p.arrival_time}</td><td>${p.scan_duration} min</td><td>${Math.max(0,now-p.arrival_time)} min</td><td><button class="ghost danger" onclick="removePatient(${i})">Remove</button></td></tr>`).join("");if(!patients.length)tbody.innerHTML='<tr><td colspan="6">No patients added yet.</td></tr>'}
function clearPatients(){patients=[];lastSchedule=[];renderPatients();document.getElementById("resultCard").classList.add("hidden");document.getElementById("scheduleCard").classList.add("hidden");document.getElementById("scenarioDescription").textContent="Choose a scenario to automatically load test patients.";clearError()}
const SCENARIOS = {
    emergency: {
        description: "Several urgent patients arrive early. Purpose: check whether emergency cases receive appropriate attention.",
        patients: [
            {patient_id:"P001",priority:"Emergency",arrival_time:0,scan_duration:30},
            {patient_id:"P002",priority:"Emergency",arrival_time:5,scan_duration:25},
            {patient_id:"P003",priority:"High",arrival_time:0,scan_duration:35},
            {patient_id:"P004",priority:"Normal",arrival_time:0,scan_duration:20},
            {patient_id:"P005",priority:"Normal",arrival_time:10,scan_duration:30}
        ]
    },
    starvation: {
        description: "A mixed queue with several normal patients. Purpose: check whether lower-priority patients eventually get scheduled instead of being ignored.",
        patients: [
            {patient_id:"P001",priority:"Emergency",arrival_time:0,scan_duration:30},
            {patient_id:"P002",priority:"High",arrival_time:0,scan_duration:25},
            {patient_id:"P003",priority:"Normal",arrival_time:0,scan_duration:20},
            {patient_id:"P004",priority:"Normal",arrival_time:0,scan_duration:30},
            {patient_id:"P005",priority:"Normal",arrival_time:0,scan_duration:25}
        ]
    },
    mixed: {
        description: "Patients arrive at different times with different scan durations. Purpose: test dynamic arrivals and changing queue conditions.",
        patients: [
            {patient_id:"P001",priority:"High",arrival_time:0,scan_duration:40},
            {patient_id:"P002",priority:"Normal",arrival_time:5,scan_duration:15},
            {patient_id:"P003",priority:"Emergency",arrival_time:20,scan_duration:30},
            {patient_id:"P004",priority:"Normal",arrival_time:35,scan_duration:20},
            {patient_id:"P005",priority:"Emergency",arrival_time:60,scan_duration:25}
        ]
    },
    balanced: {
        description: "A balanced queue containing all three priority levels and different scan durations. Purpose: general robustness check.",
        patients: [
            {patient_id:"P001",priority:"Emergency",arrival_time:10,scan_duration:30},
            {patient_id:"P002",priority:"High",arrival_time:0,scan_duration:25},
            {patient_id:"P003",priority:"Normal",arrival_time:5,scan_duration:20},
            {patient_id:"P004",priority:"High",arrival_time:25,scan_duration:35},
            {patient_id:"P005",priority:"Normal",arrival_time:15,scan_duration:30}
        ]
    }
};

function resetResultCards(){
    document.getElementById("resultCard").classList.add("hidden");
    document.getElementById("scheduleCard").classList.add("hidden");
    lastSchedule=[];
}

function loadScenario(name){
    const scenario=SCENARIOS[name];
    if(!scenario)return;
    patients=scenario.patients.map(p=>({...p}));
    document.getElementById("currentTime").value=0;
    document.getElementById("scenarioDescription").textContent=scenario.description;
    renderPatients();
    resetResultCards();
    clearError();
    document.getElementById("patientTable").scrollIntoView({behavior:"smooth",block:"center"});
}

function loadExample(){patients=[{patient_id:"P001",priority:"Emergency",arrival_time:20,scan_duration:30},{patient_id:"P002",priority:"High",arrival_time:10,scan_duration:25},{patient_id:"P003",priority:"Normal",arrival_time:15,scan_duration:20},{patient_id:"P004",priority:"Emergency",arrival_time:45,scan_duration:40},{patient_id:"P005",priority:"Normal",arrival_time:5,scan_duration:35}];document.getElementById("currentTime").value=60;document.getElementById("scenarioDescription").textContent="Built-in example used to demonstrate the dashboard.";renderPatients();resetResultCards();clearError()}
async function runScheduler(){clearError();if(!patients.length)return showError("Add at least one patient first.");try{const r=await fetch("/api/schedule",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({patients,current_time:Number(document.getElementById("currentTime").value||0)})});const d=await r.json();if(!r.ok)return showError(d.error||"Scheduling failed.");document.getElementById("resultCard").classList.remove("hidden");document.getElementById("scheduleCard").classList.add("hidden");document.getElementById("selectedId").textContent=d.selected.patient_id;document.getElementById("selectedPriority").textContent=d.selected.priority;document.getElementById("selectedWaiting").textContent=`${d.selected.waiting_time} min`;document.getElementById("selectedDuration").textContent=`${d.selected.scan_duration} min`;document.getElementById("selectedQ").textContent=d.selected.q_value;document.getElementById("explanation").textContent=d.explanation;document.getElementById("fifoChoice").textContent=d.baselines.fifo;document.getElementById("priorityChoice").textContent=d.baselines.priority;document.querySelector("#candidateTable tbody").innerHTML=d.candidates.map(c=>`<tr class="${c.selected?"selected":""}"><td>${c.rank}</td><td><strong>${escapeHtml(c.patient_id)}</strong></td><td>${escapeHtml(c.priority)}</td><td>${c.waiting_time} min</td><td>${c.scan_duration} min</td><td>${c.q_value}</td></tr>`).join("");document.getElementById("resultCard").scrollIntoView({behavior:"smooth"})}catch(e){showError("Could not connect to the Flask server.")}}
async function runFullSchedule(){clearError();if(!patients.length)return showError("Add at least one patient first.");try{const r=await fetch("/api/full_schedule",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({patients,current_time:0})});const d=await r.json();if(!r.ok)return showError(d.error||"Could not generate schedule.");lastSchedule=d.schedule;renderFullSchedule(d);document.getElementById("scheduleCard").classList.remove("hidden");document.getElementById("scheduleCard").scrollIntoView({behavior:"smooth"})}catch(e){showError("Could not connect to the Flask server.")}}
function renderFullSchedule(d){const m=d.metrics;const stats=[['Patients scheduled',m.patients_scheduled],['Average wait',`${m.average_wait} min`],['Emergency avg wait',`${m.emergency_average_wait} min`],['Maximum wait',`${m.maximum_wait} min`],['MRI utilization',`${m.mri_utilization}%`],['Idle time',`${m.idle_time} min`]];document.getElementById("statsGrid").innerHTML=stats.map(x=>`<div class="stat"><span>${x[0]}</span><strong>${x[1]}</strong></div>`).join("");document.getElementById("timeline").innerHTML=d.schedule.map(row=>`<div class="timeline-row"><div class="slot">Slot ${row.slot}</div><div><strong>${row.start_time}–${row.end_time}</strong><br><small>${row.scan_duration} min</small></div><div><div class="patient-tag">${escapeHtml(row.patient_id)} · ${escapeHtml(row.priority)}</div><div class="bar"><span></span></div></div><div>Wait: <strong>${row.waiting_time} min</strong><br>Q: ${row.q_value}</div></div>`).join("");document.querySelector("#historyTable tbody").innerHTML=d.decisions.map(x=>`<tr><td>${x.decision}</td><td><strong>${escapeHtml(x.selected_patient)}</strong></td><td>${escapeHtml(x.priority)}</td><td>${x.waiting_time} min</td><td>${x.q_value}</td><td>${x.start_time}–${x.end_time}</td><td>${escapeHtml(x.explanation)}</td></tr>`).join("")}
function downloadSchedule(){if(!lastSchedule.length)return;const headers=['Slot','Patient','Priority','Arrival Time','Start Time','End Time','Waiting Time','Scan Duration','Q Value'];const lines=[headers.join(','),...lastSchedule.map(r=>[r.slot,r.patient_id,r.priority,r.arrival_time,r.start_time,r.end_time,r.waiting_time,r.scan_duration,r.q_value].map(v=>`"${String(v).replaceAll('"','""')}"`).join(','))];const blob=new Blob([lines.join('\n')],{type:'text/csv'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='mri_dqn_schedule.csv';a.click();URL.revokeObjectURL(a.href)}
async function loadResults(){try{const r=await fetch('/api/results');const rows=await r.json();document.querySelector('#resultsTable tbody').innerHTML=rows.map(x=>`<tr><td><strong>${escapeHtml(x.Policy)}</strong></td><td>${Number(x.Average_Wait).toFixed(3)}</td><td>${Number(x.Emergency_Average_Wait).toFixed(3)}</td><td>${Number(x.Maximum_Wait).toFixed(2)}</td><td>${(Number(x.MRI_Utilization)*100).toFixed(1)}%</td><td>${Number(x.Patients_Served).toFixed(2)}</td></tr>`).join('');renderCharts(rows)}catch(e){}}
function renderCharts(rows){const metrics=[['Average waiting time','Average_Wait','min'],['Emergency waiting time','Emergency_Average_Wait','min'],['Maximum waiting time','Maximum_Wait','min'],['MRI utilization','MRI_Utilization','%']];document.getElementById('comparisonCharts').innerHTML=metrics.map(([title,key,unit])=>{const vals=rows.map(r=>({name:r.Policy,value:Number(r[key])*(unit==='%'?100:1)}));const max=Math.max(...vals.map(v=>v.value),1);return `<div class="chart"><h3>${title}</h3>${vals.map(v=>`<div class="chart-row"><span>${escapeHtml(v.name)}</span><div class="chart-bar"><span style="width:${Math.max(4,v.value/max*100)}%"></span></div><strong>${v.value.toFixed(unit==='%'?1:2)}${unit==='%'?'%':' min'}</strong></div>`).join('')}</div>`}).join('')}
function showError(msg){const el=document.getElementById('error');el.textContent=msg;el.classList.remove('hidden')}
function clearError(){document.getElementById('error').classList.add('hidden')}
document.getElementById('currentTime').addEventListener('input',renderPatients);renderPatients();loadResults();

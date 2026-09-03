import { useEffect, useState } from 'react'
import { supabase, type Fichaje, type Geocerca } from '../../lib/supabase'
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import * as XLSX from 'xlsx'
import { distanciaMetros } from '../../lib/geofence'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

type Profile = { id:string, nombre:string, email:string, rol:string }

export default function Fichajes(){
  const [fichajes, setFichajes] = useState<Fichaje[]>([])
  const [sucursales, setSucursales] = useState<Geocerca[]>([])
  const [usuarios, setUsuarios] = useState<Profile[]>([])
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroEmpleado, setFiltroEmpleado] = useState('')
  const [filtroFecha, setFiltroFecha] = useState('')
  const [filtroSucursal, setFiltroSucursal] = useState('')
  const [editing, setEditing] = useState<Fichaje | null>(null)
  const [editForm, setEditForm] = useState({ tipo:'entrada' as Fichaje['tipo'], sucursal_id:'', fecha:'', hora:'' })
  const [showManual, setShowManual] = useState(false)
  const [manual, setManual] = useState({ user_id:'', tipo:'entrada' as Fichaje['tipo'], sucursal_id:'', fecha:'', hora:'' })
  const [msg, setMsg] = useState<string|null>(null)
  const [exportMes, setExportMes] = useState(new Date().toISOString().slice(0,7))

  const load = async()=>{
    const { data } = await supabase.from('fichajes').select('*, profiles(nombre,email)').order('created_at',{ascending:false}).limit(400)
    setFichajes((data as any) ?? [])
    const { data:g } = await supabase.from('geocercas').select('*').order('nombre')
    setSucursales((g as any) ?? [])
    const { data:u } = await supabase.from('profiles').select('id,nombre,email,rol').order('nombre')
    setUsuarios((u as any) ?? [])
    // default manual fecha hoy
    const now = new Date()
    const f = now.toISOString().slice(0,10)
    const h = now.toTimeString().slice(0,5)
    setManual(m=> ({...m, fecha: f, hora: h}))
  }
  useEffect(()=>{ load(); const ch=supabase.channel('fichajes-admin').on('postgres_changes',{event:'*',schema:'public',table:'fichajes'},()=>load()).subscribe(); return()=>{supabase.removeChannel(ch)} },[])

  const sucMap = new Map(sucursales.map(s=>[s.id,s]))
  const filtrados = fichajes.filter(f=>{
    if(filtroTipo && f.tipo!==filtroTipo) return false
    if(filtroEmpleado && !f.profiles?.nombre.toLowerCase().includes(filtroEmpleado.toLowerCase()) && !f.profiles?.email.toLowerCase().includes(filtroEmpleado.toLowerCase())) return false
    if(filtroFecha && !f.created_at.startsWith(filtroFecha)) return false
    if(filtroSucursal){
      if(filtroSucursal==='__sin__' && f.geocerca_id) return false
      if(filtroSucursal!=='__sin__' && f.geocerca_id!==filtroSucursal) return false
    }
    return true
  })

  const exportExcel=()=>{
    const rows=filtrados.map(f=>{
      const suc=f.geocerca_id ? sucMap.get(f.geocerca_id) : null
      return { Fecha:new Date(f.created_at).toLocaleString(), Empleado:f.profiles?.nombre, Email:f.profiles?.email, Tipo:f.tipo, Sucursal:suc?.nombre ?? 'Fuera', Provincia:(suc as any)?.provincia ?? '', Lat:f.lat, Lng:f.lng, Direccion:f.direccion, Dentro:f.dentro_geocerca?'SI':'NO', Distancia_m:f.distancia_m, Foto:f.foto_url }
    })
    const ws=XLSX.utils.json_to_sheet(rows); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Fichajes'); XLSX.writeFile(wb, `Aresa_Fichajes_${new Date().toISOString().slice(0,10)}.xlsx`)
  }
  const exportPorSucursal=()=>{
    const source = filtrados.length ? filtrados : fichajes
    const porSuc = new Map<string, typeof source>()
    for(const f of source){
      const suc = f.geocerca_id ? sucMap.get(f.geocerca_id)?.nombre ?? 'Fuera' : 'Fuera'
      if(!porSuc.has(suc)) porSuc.set(suc, [])
      porSuc.get(suc)!.push(f)
    }
    const wb=XLSX.utils.book_new()
    for(const [suc, list] of porSuc){
      const rows=list.map(f=>{
        const s=f.geocerca_id ? sucMap.get(f.geocerca_id) : null
        return { Fecha:new Date(f.created_at).toLocaleString(), Empleado:f.profiles?.nombre, Email:f.profiles?.email, Tipo:f.tipo, Sucursal:s?.nombre ?? 'Fuera', Provincia:(s as any)?.provincia ?? '', Lat:f.lat, Lng:f.lng, Direccion:f.direccion, Dentro:f.dentro_geocerca?'SI':'NO', Distancia_m:f.distancia_m, Foto:f.foto_url }
      })
      const ws=XLSX.utils.json_to_sheet(rows)
      ws['!cols']=[{wch:18},{wch:18},{wch:28},{wch:10},{wch:18},{wch:12},{wch:12},{wch:12},{wch:30},{wch:8},{wch:12},{wch:40}]
      XLSX.utils.book_append_sheet(wb, ws, suc.slice(0,31))
    }
    // hoja todos
    const allRows=source.map(f=>{
      const s=f.geocerca_id ? sucMap.get(f.geocerca_id) : null
      return { Fecha:new Date(f.created_at).toLocaleString(), Empleado:f.profiles?.nombre, Email:f.profiles?.email, Tipo:f.tipo, Sucursal:s?.nombre ?? 'Fuera', Provincia:(s as any)?.provincia ?? '', Lat:f.lat, Lng:f.lng, Direccion:f.direccion, Dentro:f.dentro_geocerca?'SI':'NO', Distancia_m:f.distancia_m, Foto:f.foto_url }
    })
    const wsAll=XLSX.utils.json_to_sheet(allRows)
    XLSX.utils.book_append_sheet(wb, wsAll, 'Todos')
    XLSX.writeFile(wb, `Aresa_Fichajes_por_Sucursal_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  const exportSimonetti = async()=>{
    try{
      const [y,m]=exportMes.split('-').map(Number)
      const daysInMonth=new Date(y,m,0).getDate()
      const mesNombres=['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']
      const diaSem=['DOMINGO','LUNES','MARTES','MIÉRCOLES','JUEVES','VIERNES','SÁBADO']
      const mesStr=mesNombres[m-1]
      // traer fichajes del mes
      const start=`${exportMes}-01T00:00:00`
      const end=new Date(y,m,1).toISOString().slice(0,10)+'T00:00:00'
      const { data: fichMes } = await supabase.from('fichajes').select('user_id,tipo,created_at,profiles(nombre)').gte('created_at', start).lt('created_at', end).order('created_at', {ascending:true}).limit(5000)
      const { data: profs } = await supabase.from('profiles').select('id,nombre,email').order('nombre')
      const listaProfs = (profs as any) ?? []
      // cargar plantilla
      const res=await fetch('/template-fichajes.xlsx')
      const buf=await res.arrayBuffer()
      const wb=XLSX.read(buf, {type:'array', cellStyles:true})
      const sheetName=wb.SheetNames[0]
      const ws=wb.Sheets[sheetName]
      // mapear columnas por día a partir de plantilla (misma estructura)
      // construir mapa día -> { entradaCols:[], salidaCols:[], totalCol, diasCol, ausenciaCol }
      // parsear fila 1 y 2
      const dayCols: Record<number, { entrada:number[], salida:number[], total:number|null, dias:number|null, ausencia:number|null }> = {}
      // necesitamos leer merges y celdas
      const merges = (ws['!merges'] as any[]) ?? []
      // para cada col, encontrar su día header
      const colToDay: Record<number,string> = {}
      for(const mr of merges){
        const c = wb.Sheets[sheetName][XLSX.utils.encode_cell({r:mr.s.r, c:mr.s.c})]
        const v = c?.v
        if(v && typeof v==='string' && v.match(/^\d+-/)){
          for(let cIdx=mr.s.c; cIdx<=mr.e.c; cIdx++) colToDay[cIdx+1]=v
        }
      }
      // fallback: por si no hay merges para todos, leer celdas directas
      for(let c=1;c<=227;c++){
        const addr=XLSX.utils.encode_cell({r:0,c:c-1})
        const cell=ws[addr]
        if(cell?.v && typeof cell.v==='string' && cell.v.match(/^\d+-/)) colToDay[c]=cell.v
      }
      // construir dayCols por día num
      for(let col=1; col<=227; col++){
        const dayStr = colToDay[col]
        if(!dayStr) continue
        const dayNum = parseInt(dayStr.split('-')[0])
        if(!dayNum || dayNum>31) continue
        if(!dayCols[dayNum]) dayCols[dayNum]={ entrada:[], salida:[], total:null, dias:null, ausencia:null }
        const subAddr=XLSX.utils.encode_cell({r:1,c:col-1})
        const sub=ws[subAddr]?.v
        if(sub==='Entrada') dayCols[dayNum].entrada.push(col)
        else if(sub==='Salida') dayCols[dayNum].salida.push(col)
        else if(sub==='Total Hs.') dayCols[dayNum].total=col
        else if(sub==='DÍAS TRABAJADOS' || sub==='D\xcdAS TRABAJADOS') dayCols[dayNum].dias=col
        else if(sub==='Ausencia') dayCols[dayNum].ausencia=col
      }
      // actualizar headers de días para el mes exportado
      for(let d=1; d<=31; d++){
        const dc = dayCols[d]
        if(!dc) continue
        const dt=new Date(y,m-1,d)
        const wd = diaSem[dt.getDay()]
        const newHeader = d<=daysInMonth ? `${d}-${mesStr} ${wd}` : ''
        // actualizar todas las celdas que pertenecen a ese día (solo la primera del merge)
        // buscar merges de ese día
        for(const mr of merges){
          const addr=XLSX.utils.encode_cell({r:0,c:mr.s.c})
          const cell=ws[addr]
          if(cell && cell.v && String(cell.v).startsWith(`${d}-`)){
            cell.v = newHeader
            cell.w = newHeader
            cell.h = newHeader
            // actualizar t
            if(newHeader==='') { cell.v=''; cell.w=''; cell.h='' }
          }
        }
        // si el día no existe en mes (31 en feb), limpiar
        if(d>daysInMonth){
          // limpiar cam[pos] no necesario, se dejará vacío
        }
      }
      // renombrar hoja
      const newName = `${mesStr}-${y.toString().slice(-2)}`
      wb.SheetNames[0]=newName
      wb.Sheets[newName]=ws
      delete wb.Sheets[sheetName]

      // agrupar fichajes por usuario y día
      const fichByUserDay = new Map<string, Map<number, {entrada:string[], salida:string[]}>>()
      for(const f of (fichMes as any) ?? []){
        const d=new Date(f.created_at)
        if(d.getMonth()+1!==m || d.getFullYear()!==y) continue
        const day=d.getDate()
        const key=f.user_id
        if(!fichByUserDay.has(key)) fichByUserDay.set(key, new Map())
        const mDay=fichByUserDay.get(key)!
        if(!mDay.has(day)) mDay.set(day, {entrada:[], salida:[]})
        const entry=mDay.get(day)!
        const hh=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')
        if(f.tipo==='entrada') entry.entrada.push(hh)
        else if(f.tipo==='salida') entry.salida.push(hh)
      }

      // limpiar filas de datos existentes (desde fila 3)
      const range = XLSX.utils.decode_range(ws['!ref']!)
      // borrar filas 3..34 (hasta 32 empleados + totales) - mantendremos 32 filas
      for(let r=2; r<35; r++){
        for(let c=0;c<=range.e.c;c++){
          const addr=XLSX.utils.encode_cell({r,c})
          if(ws[addr] && r>=2){
            // mantener fórmulas? solo limpiar valores de datos, pero dejamos legajo/nombre vacíos para rellenar
            if(c>=4) { // desde columna E (ausencia)
              delete ws[addr]
            }
          }
        }
      }

      // llenar filas por usuario
      let rowIdx=2 // 0-indexed, fila 3
      for(const prof of listaProfs){
        if(rowIdx>=34) break
        const legajo = prof.id.slice(0,8).toUpperCase()
        // columnas A-D: LEGAJO, APELLIDO Y NOMBRE, DESTINO, RAZON
        const addrA=XLSX.utils.encode_cell({r:rowIdx,c:0}); ws[addrA]={t:'s', v:legajo}
        const addrB=XLSX.utils.encode_cell({r:rowIdx,c:1}); ws[addrB]={t:'s', v:prof.nombre}
        const addrC=XLSX.utils.encode_cell({r:rowIdx,c:2}); ws[addrC]={t:'s', v:''}
        const addrD=XLSX.utils.encode_cell({r:rowIdx,c:3}); ws[addrD]={t:'s', v:'ARESA'}

        const userDays = fichByUserDay.get(prof.id)
        for(let d=1; d<=daysInMonth; d++){
          const dc=dayCols[d]
          if(!dc) continue
          const dayData = userDays?.get(d)
          if(!dayData){
            // ausencia: marcar ausente? dejar vacío y poner Ausencia = 'A' ?
            if(dc.ausencia){
              const aAddr=XLSX.utils.encode_cell({r:rowIdx,c:dc.ausencia-1})
              ws[aAddr]={t:'s', v:''}
            }
            continue
          }
          // llenar Entrada/Salida en orden: intercalar entrada/salida
          const allTimes: string[] = []
          // combinar en pares: entrada1, salida1, entrada2, salida2...
          const maxPairs = Math.max(dayData.entrada.length, dayData.salida.length)
          for(let i=0;i<maxPairs;i++){
            if(dayData.entrada[i]) allTimes.push(dayData.entrada[i])
            if(dayData.salida[i]) allTimes.push(dayData.salida[i])
          }
          const orderedCols: number[] = []
          const dayColIndices = (Object.values(dc).flat().filter(Boolean) as number[]).sort((a,b)=>a-b)
          // pero filtramos solo Entrada/Salida ya ordenadas por col
          const entradaSet=new Set(dc.entrada), salidaSet=new Set(dc.salida)
          for(const col of dayColIndices){
            if(entradaSet.has(col) || salidaSet.has(col)) orderedCols.push(col)
          }
          for(let i=0;i<Math.min(allTimes.length, orderedCols.length); i++){
            const col=orderedCols[i]
            const addr=XLSX.utils.encode_cell({r:rowIdx,c:col-1})
            // guardar como string h:mm, Excel lo mostrará
            ws[addr]={t:'s', v:allTimes[i], z:'h:mm'}
          }
          // calcular Total Hs. del día si hay par completo
          if(dc.total && dayData.entrada.length && dayData.salida.length){
            let totalMin=0
            const pairs=Math.min(dayData.entrada.length, dayData.salida.length)
            for(let i=0;i<pairs;i++){
              const [h1,m1]=dayData.entrada[i].split(':').map(Number)
              const [h2,m2]=dayData.salida[i].split(':').map(Number)
              totalMin+=(h2*60+m2)-(h1*60+m1)
            }
            if(totalMin>0){
              const totalAddr=XLSX.utils.encode_cell({r:rowIdx,c:dc.total-1})
              const excelVal = totalMin / (24*60)
              ws[totalAddr]={t:'n', v:excelVal, z:'[h]:mm'}
            }
          }
          if(dc.dias){
            const diasAddr=XLSX.utils.encode_cell({r:rowIdx,c:dc.dias-1})
            const hasFichaje = dayData.entrada.length>0 || dayData.salida.length>0
            ws[diasAddr]={t:'n', v: hasFichaje?1:0}
          }
          if(dc.ausencia){
            const ausAddr=XLSX.utils.encode_cell({r:rowIdx,c:dc.ausencia-1})
            const hasFichaje = dayData.entrada.length>0 || dayData.salida.length>0
            ws[ausAddr]={t:'s', v: hasFichaje?'':'A'}
          }
        }
        // HORAS TOTALES y DIAS al final (cols 226,227)
        // calcular totales del mes para este usuario
        let mesTotalMin=0, diasTrab=0
        for(let d=1; d<=daysInMonth; d++){
          const dc=dayCols[d]
          if(dc?.total){
            const addr=XLSX.utils.encode_cell({r:rowIdx,c:dc.total-1})
            const cell=ws[addr]
            if(cell?.v && typeof cell.v==='number'){
              mesTotalMin+= cell.v * 24*60
            }
          }
          if(dc?.dias){
            const addr=XLSX.utils.encode_cell({r:rowIdx,c:dc.dias-1})
            const cell=ws[addr]
            if(cell?.v===1) diasTrab++
          }
        }
        const horasTotCol=226, diasTotCol=227
        const htAddr=XLSX.utils.encode_cell({r:rowIdx,c:horasTotCol-1})
        if(mesTotalMin>0) ws[htAddr]={t:'n', v: mesTotalMin/(24*60), z:'[h]:mm'}
        const dtAddr=XLSX.utils.encode_cell({r:rowIdx,c:diasTotCol-1})
        ws[dtAddr]={t:'n', v:diasTrab}

        rowIdx++
      }

      // actualizar !ref si hace falta
      ws['!ref']=XLSX.utils.encode_range({s:{r:0,c:0}, e:{r:34, c:226}})

      XLSX.writeFile(wb, `Simonetti_${mesStr}${y}_Fichajes_${exportMes}.xlsx`)
      setMsg(`Exportado formato Simonetti ${mesStr} ${y} ✓`)
    }catch(e:any){
      console.error(e)
      setMsg('Error export Simonetti: '+e.message)
    }
  }

  const openEdit = (f:Fichaje)=>{
    setEditing(f)
    const d = new Date(f.created_at)
    setEditForm({ tipo:f.tipo, sucursal_id: f.geocerca_id ?? '', fecha: d.toISOString().slice(0,10), hora: d.toTimeString().slice(0,5) })
    setMsg(null)
  }

  const saveEdit = async()=>{
    if(!editing) return
    const suc = sucursales.find(s=>s.id===editForm.sucursal_id)
    const newDate = new Date(`${editForm.fecha}T${editForm.hora}:00`)
    // recalcular lat/lng/distancia si cambia sucursal
    let lat = editing.lat, lng = editing.lng, distancia = editing.distancia_m, dentro = editing.dentro_geocerca
    let geocerca_id: string | null = editForm.sucursal_id || null
    if(suc){
      lat = suc.lat; lng = suc.lng
      const d = distanciaMetros(editing.lat, editing.lng, suc.lat, suc.lng)
      distancia = Math.round(d); dentro = d <= suc.radio_m
    }
    // si no hay sucursal seleccionada, mantener coords originales pero marcar fuera
    if(!suc){
      geocerca_id = null; dentro = false
    }
    const { error } = await supabase.from('fichajes').update({
      tipo: editForm.tipo,
      geocerca_id,
      lat, lng,
      distancia_m: distancia,
      dentro_geocerca: dentro,
      created_at: newDate.toISOString(),
    }).eq('id', editing.id)
    if(error) setMsg('Error: '+error.message)
    else { setEditing(null); load() }
  }

  const crearManual = async()=>{
    if(!manual.user_id) return setMsg('Elegí usuario')
    if(!manual.sucursal_id) return setMsg('Elegí sucursal')
    const suc = sucursales.find(s=>s.id===manual.sucursal_id)
    if(!suc) return setMsg('Sucursal no encontrada')
    const dt = new Date(`${manual.fecha}T${manual.hora}:00`)
    // verifica RLS admin - necesita migración supabase_migracion_admin_fichajes.sql
    const { error } = await supabase.from('fichajes').insert({
      user_id: manual.user_id,
      tipo: manual.tipo,
      lat: suc.lat,
      lng: suc.lng,
      direccion: (suc as any).direccion ?? suc.nombre,
      foto_url: null,
      dentro_geocerca: true,
      geocerca_id: suc.id,
      distancia_m: 0,
      created_at: dt.toISOString(),
    })
    if(error) setMsg('Error crear: '+error.message+' — ¿Ejecutaste supabase_migracion_admin_fichajes.sql ?')
    else { setMsg('Fichaje manual creado ✓'); setShowManual(false); load() }
  }

  const borrar = async(id:string)=>{
    if(!confirm('¿Borrar fichaje?')) return
    const { error } = await supabase.from('fichajes').delete().eq('id', id)
    if(error) alert(error.message); else load()
  }

  const center:[number,number]=sucursales[0]?[sucursales[0].lat,sucursales[0].lng]:filtrados[0]?[filtrados[0].lat,filtrados[0].lng]:[-32.2426,-63.542]
  return (
    <div className="space-y-4">
      <div className="bg-white p-3 sm:p-4 rounded-xl shadow">
        <h2 className="text-lg sm:text-xl font-bold">Registro de fichajes — Admin editable</h2>
        <p className="text-xs sm:text-sm text-gray-500">Cada fichaje es un evento. Puedes cambiar sucursal, fecha/hora y tipo. Crear manual asignando usuario y sucursal.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap gap-2 sm:gap-3 items-end mt-3">
          <input value={filtroEmpleado} onChange={e=>setFiltroEmpleado(e.target.value)} placeholder="Filtrar empleado" className="border rounded px-3 py-2 w-full lg:w-auto" />
          <select value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)} className="border rounded px-3 py-2 w-full lg:w-auto">
            <option value="">Todos los tipos</option><option value="entrada">Entrada</option><option value="salida">Salida</option>
          </select>
          <select value={filtroSucursal} onChange={e=>setFiltroSucursal(e.target.value)} className="border rounded px-3 py-2 w-full lg:w-auto lg:min-w-[180px]">
            <option value="">Todas las sucursales</option><option value="__sin__">Fuera de sucursal</option>
            {sucursales.map(s=> <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <input type="date" value={filtroFecha} onChange={e=>setFiltroFecha(e.target.value)} className="border rounded px-3 py-2 w-full lg:w-auto" />
          <div className="flex flex-wrap gap-2 w-full lg:w-auto">
            <button onClick={exportExcel} className="flex-1 lg:flex-none bg-green-600 text-white px-4 py-2 rounded text-sm">Exportar (filtro)</button>
            <button onClick={exportPorSucursal} className="flex-1 lg:flex-none bg-amber text-white px-4 py-2 rounded text-sm">Por sucursal</button>
            <button onClick={()=>setShowManual(v=>!v)} className="flex-1 lg:flex-none bg-ink text-paper px-4 py-2 rounded text-sm">+ Manual</button>
          </div>
          <div className="flex gap-2 w-full lg:w-auto items-center">
            <input type="month" value={exportMes} onChange={e=>setExportMes(e.target.value)} className="border rounded px-2 py-1 text-sm" />
            <button onClick={exportSimonetti} className="bg-[#163A5F] text-white px-3 py-2 rounded text-sm">Formato Simonetti</button>
          </div>
          <span className="text-xs sm:text-sm text-gray-500 col-span-1 sm:col-span-2 lg:col-span-1">{filtrados.length} registros · {usuarios.length} usuarios</span>
        </div>
      </div>

      {showManual && (
        <div className="bg-white p-4 rounded-xl shadow space-y-3">
          <h3 className="font-bold">Crear fichaje manual</h3>
          <div className="grid md:grid-cols-2 gap-3">
            <select value={manual.user_id} onChange={e=>setManual({...manual, user_id:e.target.value})} className="border rounded px-3 py-2">
              <option value="">Elegí usuario ({usuarios.length})</option>
              {usuarios.map(u=> <option key={u.id} value={u.id}>{u.nombre} · {u.email} · {u.rol}</option>)}
            </select>
            <select value={manual.sucursal_id} onChange={e=>setManual({...manual, sucursal_id:e.target.value})} className="border rounded px-3 py-2">
              <option value="">Elegí sucursal</option>
              {sucursales.map(s=> <option key={s.id} value={s.id}>{s.nombre} · {(s as any).provincia ?? ''} · {s.lat.toFixed(4)},{s.lng.toFixed(4)}</option>)}
            </select>
            <select value={manual.tipo} onChange={e=>setManual({...manual, tipo:e.target.value as any})} className="border rounded px-3 py-2">
              <option value="entrada">Entrada</option><option value="salida">Salida</option>
            </select>
            <div className="flex gap-2">
              <input type="date" value={manual.fecha} onChange={e=>setManual({...manual, fecha:e.target.value})} className="border rounded px-3 py-2 flex-1" />
              <input type="time" value={manual.hora} onChange={e=>setManual({...manual, hora:e.target.value})} className="border rounded px-3 py-2 w-32" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={crearManual} className="bg-red-600 text-white px-6 py-2 rounded font-bold">Crear fichaje</button>
            <button onClick={()=>setShowManual(false)} className="border px-4 py-2 rounded">Cancelar</button>
          </div>
          <p className="text-xs text-gray-500">Se guardará con coordenadas de la sucursal y marcado como dentro. Si no ejecutaste la migración RLS, te dará error — corre <code>supabase_migracion_admin_fichajes.sql</code>.</p>
        </div>
      )}

      {msg && <div className="bg-blue-50 border border-blue-200 p-3 rounded text-sm">{msg}</div>}

      {editing && (
        <div className="fixed inset-0 bg-black/60 grid place-items-center z-[9999] p-4" onClick={()=>setEditing(null)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-lg space-y-3" onClick={e=>e.stopPropagation()}>
            <h3 className="font-bold">Editar fichaje — {editing.profiles?.nombre}</h3>
            <p className="text-xs text-gray-500">{editing.id}</p>
            <select value={editForm.tipo} onChange={e=>setEditForm({...editForm, tipo:e.target.value as any})} className="w-full border rounded px-3 py-2">
              <option value="entrada">Entrada</option><option value="salida">Salida</option>
            </select>
            <select value={editForm.sucursal_id} onChange={e=>setEditForm({...editForm, sucursal_id:e.target.value})} className="w-full border rounded px-3 py-2">
              <option value="">Sin sucursal (fuera)</option>
              {sucursales.map(s=> <option key={s.id} value={s.id}>{s.nombre} · {s.lat.toFixed(4)},{s.lng.toFixed(4)}</option>)}
            </select>
            <div className="flex gap-2">
              <input type="date" value={editForm.fecha} onChange={e=>setEditForm({...editForm, fecha:e.target.value})} className="border rounded px-3 py-2 flex-1" />
              <input type="time" value={editForm.hora} onChange={e=>setEditForm({...editForm, hora:e.target.value})} className="border rounded px-3 py-2 w-32" />
            </div>
            <div className="flex gap-2">
              <button onClick={saveEdit} className="flex-1 bg-red-600 text-white py-2 rounded font-bold">Guardar cambios</button>
              <button onClick={()=>setEditing(null)} className="flex-1 border py-2 rounded">Cancelar</button>
            </div>
            <p className="text-xs text-gray-500">Cambiar sucursal recalculará lat/lng a la sucursal y distancia. Fecha/hora se guarda en UTC.</p>
          </div>
        </div>
      )}

      <div className="bg-white p-3 sm:p-4 rounded-xl shadow">
        <div className="h-[280px] sm:h-[380px] rounded overflow-hidden border">
          <MapContainer center={center} zoom={sucursales.length?6:5} style={{height:'100%',width:'100%'}}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            {sucursales.map(s=> <Circle key={s.id} center={[s.lat,s.lng]} radius={s.radio_m} pathOptions={{ color:'#9ca3af', fillOpacity:0.08 }}><Popup>{s.nombre} · {s.radio_m} m</Popup></Circle>)}
            {filtrados.slice(0,100).map(f=> <Marker key={f.id} position={[f.lat,f.lng]}><Popup><b>{f.profiles?.nombre}</b> - {f.tipo}<br/>{new Date(f.created_at).toLocaleString()}<br/>{f.direccion}<br/><a href={f.foto_url??'#'} target="_blank" rel="noreferrer">Ver foto</a></Popup></Marker>)}
          </MapContainer>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="overflow-auto max-h-[700px] -mx-3 sm:mx-0">
          <table className="w-full text-xs sm:text-sm min-w-[700px]">
            <thead className="bg-gray-50 sticky top-0"><tr><th className="p-2 text-left">Fecha</th><th className="p-2 text-left">Empleado</th><th className="p-2">Tipo</th><th className="p-2 text-left">Sucursal</th><th className="p-2">Ubicación</th><th className="p-2">Foto</th><th className="p-2">Acciones</th></tr></thead>
            <tbody>
              {filtrados.map(f=>{
                const suc=f.geocerca_id? sucMap.get(f.geocerca_id):null
                return <tr key={f.id} className="border-t hover:bg-gray-50"><td className="p-2 whitespace-nowrap text-xs">{new Date(f.created_at).toLocaleString()}</td><td className="p-2"><div className="font-medium">{f.profiles?.nombre}</div><div className="text-xs text-gray-500">{f.profiles?.email}</div></td><td className="p-2 text-center"><span className={`px-2 py-1 rounded text-xs font-bold ${f.tipo==='entrada'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{f.tipo}</span></td><td className="p-2 text-xs">{suc? <><b>{suc.nombre}</b><div className="text-gray-500">{f.dentro_geocerca?'✓ Dentro':`⚠ ${f.distancia_m}m fuera`}</div></>:<span className="text-red-600">Fuera</span>}</td><td className="p-2 text-xs"><a href={`https://www.google.com/maps?q=${f.lat},${f.lng}`} target="_blank" rel="noreferrer" className="text-blue-600 underline">{f.lat.toFixed(4)}, {f.lng.toFixed(4)}</a></td><td className="p-2">{f.foto_url? <a href={f.foto_url} target="_blank" rel="noreferrer"><img src={f.foto_url} className="w-12 h-12 object-cover rounded border"/></a>:'—'}</td><td className="p-2 flex gap-1"><button onClick={()=>openEdit(f)} className="px-2 py-1 border rounded text-xs bg-white">Editar</button><button onClick={()=>borrar(f.id)} className="px-2 py-1 bg-red-50 text-red-700 border border-red-200 rounded text-xs">Borrar</button></td></tr>
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

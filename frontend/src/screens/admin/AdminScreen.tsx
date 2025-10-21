import React,{useState} from 'react';
import {View,Text,StyleSheet,TextInput,TouchableOpacity,ScrollView} from 'react-native';
import { uploadInvites, sendTestPush, promoteUser, type UserRole } from '../../services/api';
import { useToast } from '../../components/ToastProvider';
import { useAuth } from '../../auth/AuthContext';

export default function AdminScreen(){
  const toast = useToast();
  const { user } = useAuth();
  const [csv,setCsv]=useState('email,classCode,role\nanna@example.com,3A,guardian\n');
  const [preview,setPreview]=useState<string[][]>([]);
  const [validated,setValidated]=useState(false);
  const [promoteEmail,setPromoteEmail]=useState('');
  const [promoteRole,setPromoteRole]=useState<UserRole>('teacher');
  const roles: UserRole[] = ['guardian','teacher','admin'];
  const showPromote=user?.role==='teacher'||user?.role==='admin';
  const isAdmin=user?.role==='admin';
  const onPreview=()=>{
    try{
      const lines = csv.trim().split(/\r?\n/);
      const rows = lines.map(l=>l.split(',').map(s=>s.trim()));
      const header = rows[0]?.map((value) => value.toLowerCase()) ?? [];
      const hasEmail = header.includes('email');
      const hasClass = header.includes('classcode');
      setPreview(rows);
      setValidated(rows.length>1 && hasEmail && hasClass);
    }catch{ setPreview([['Fel vid parsning']]); setValidated(false); }
  };
  const onUpload=async()=>{
    if(!validated){ toast.show('CSV saknar korrekta kolumnnamn (email,classCode[,role])'); return; }
    const lines = csv.trim().split(/\r?\n/);
    const header = lines[0]?.split(',').map((s)=>s.trim().toLowerCase()) ?? [];
    const roleIdx = header.indexOf('role');
    if(roleIdx>=0){
      const invalidRoles = lines.slice(1)
        .map((line)=>line.split(',').map((s)=>s.trim())[roleIdx])
        .filter((value)=>value && !roles.includes(value.toLowerCase() as UserRole));
      if(invalidRoles.length>0){
        toast.show('Ogiltig roll i CSV (tillåtna: guardian, teacher, admin)');
        return;
      }
    }
    try {
      const res=await uploadInvites(csv);
      toast.show(`Skickade ${res.count} inbjudningar`);
    } catch (error: any) {
      if (error?.response?.status === 403) {
        toast.show('Du saknar behörighet');
      } else {
        toast.show('Kunde inte skicka inbjudningar');
      }
    }
  };
  const onTestPush=async()=>{
    try {
      await sendTestPush({ classId:'class-1', title:'Testnotis', body:'Detta är en testnotis.'});
      toast.show('Testnotis skickad');
    } catch (error: any) {
      if (error?.response?.status === 403) {
        toast.show('Du saknar behörighet');
      } else {
        toast.show('Kunde inte skicka testnotis');
      }
    }
  };
  const onPromote=async()=>{
    if(!promoteEmail.trim()){
      toast.show('Ange e-postadress');
      return;
    }
    try{
      const res=await promoteUser({ email:promoteEmail.trim(), role:promoteRole });
      toast.show(`${res.user.email} har nu rollen ${res.user.role}`);
    }catch(error:any){
      if(error?.response?.status===403){
        toast.show('Du saknar behörighet');
      }else{
        toast.show('Kunde inte uppdatera roll just nu');
      }
    }
  };
  return(<ScrollView style={styles.c} contentContainerStyle={{padding:16}}>
    <Text style={styles.t}>Admin</Text>
    <Text style={styles.roleText}>Din roll: <Text style={styles.roleValue}>{user?.role ?? 'okänd'}</Text></Text>
    <Text style={styles.l}>CSV (email,classCode,role)</Text>
    <TextInput multiline value={csv} onChangeText={(t)=>{setCsv(t); setPreview([]); setValidated(false);}} style={styles.textarea} />
    <TouchableOpacity style={[styles.btn,styles.secondary]} onPress={onPreview}><Text style={styles.bt}>Förhandsgranskning</Text></TouchableOpacity>
    {preview.length>0 && <View style={{marginTop:8}}>
      {preview.slice(0,6).map((row,i)=>(<Text key={i} style={{color:'#9ca3af'}}>{row.join(' , ')}</Text>))}
      {!validated && <Text style={{color:'#ef4444',marginTop:4}}>Rubrik måste vara: email,classCode[,role]</Text>}
    </View>}
    <TouchableOpacity style={styles.btn} onPress={onUpload}><Text style={styles.bt}>Skicka inbjudningar</Text></TouchableOpacity>
    <TouchableOpacity style={[styles.btn,styles.secondary]} onPress={onTestPush}><Text style={styles.bt}>Skicka testnotis</Text></TouchableOpacity>
    <Text style={styles.hint}>Tillåtna roller: guardian, teacher, admin. Oifylld kolumn ger guardian.</Text>
    {showPromote && (
      <View style={styles.promoteSection}>
        <Text style={styles.subTitle}>Promote användare</Text>
        {!isAdmin && <Text style={styles.hint}>Endast administratörer kan genomföra uppgraderingen.</Text>}
        <Text style={styles.l}>E-postadress</Text>
        <TextInput value={promoteEmail} onChangeText={setPromoteEmail} placeholder="user@example.com" placeholderTextColor="#6b7280" style={styles.textarea} autoCapitalize="none" />
        <Text style={styles.l}>Ny roll</Text>
        <View style={styles.rolePicker}>
          {roles.map((role)=>(
            <TouchableOpacity key={role} style={[styles.chip, promoteRole===role && styles.chipActive]} onPress={()=>setPromoteRole(role)}>
              <Text style={[styles.chipText, promoteRole===role && styles.chipTextActive]}>{role}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.btn} onPress={onPromote}><Text style={styles.bt}>Uppdatera roll</Text></TouchableOpacity>
      </View>
    )}
  </ScrollView>);
}
const styles=StyleSheet.create({
  c:{flex:1,backgroundColor:'#0b1220'},
  t:{color:'white',fontSize:24,fontWeight:'800',marginBottom:12},
  roleText:{color:'#9ca3af',marginBottom:12},
  roleValue:{color:'#fbbf24',fontWeight:'700'},
  l:{color:'#9ca3af',marginBottom:6},
  textarea:{minHeight:60,backgroundColor:'#111827',color:'white',padding:12,borderRadius:12,borderWidth:1,borderColor:'#374151',marginBottom:12},
  btn:{backgroundColor:'#3b82f6',padding:14,borderRadius:12,alignItems:'center',marginTop:8},
  secondary:{backgroundColor:'#1f2937'},
  bt:{color:'white',fontWeight:'700'},
  hint:{color:'#9ca3af',marginTop:12},
  promoteSection:{marginTop:24,paddingTop:16,borderTopWidth:1,borderTopColor:'#1f2937'},
  subTitle:{color:'white',fontSize:20,fontWeight:'700',marginBottom:12},
  rolePicker:{flexDirection:'row',flexWrap:'wrap',marginBottom:8},
  chip:{paddingVertical:8,paddingHorizontal:14,borderRadius:999,borderWidth:1,borderColor:'#374151',backgroundColor:'#111827',marginRight:8,marginBottom:8},
  chipActive:{backgroundColor:'#3b82f6',borderColor:'#3b82f6'},
  chipText:{color:'#9ca3af',fontWeight:'600',textTransform:'capitalize'},
  chipTextActive:{color:'white'}
});
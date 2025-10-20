import React,{useState} from 'react';
import {View,Text,StyleSheet,TextInput,TouchableOpacity} from 'react-native';
import { createEvent } from '../../services/api';
export default function EventEditor(){
  const [title,setTitle]=useState('');
  const [description,setDescription]=useState('');
  const [type,setType]=useState('LÄXA');
  const [start,setStart]=useState(new Date(Date.now()+36*3600*1000).toISOString());
  const [end,setEnd]=useState(new Date(Date.now()+38*3600*1000).toISOString());
  const onSave=async()=>{
    await createEvent({ classId:'class-1', type, title, description, start, end });
    alert('Händelse skapad – push skickas om token finns');
  };
  return(<View style={styles.c}>
    <Text style={styles.t}>Skapa händelse</Text>
    <Text style={styles.l}>Titel</Text><TextInput value={title} onChangeText={setTitle} style={styles.i}/>
    <Text style={styles.l}>Beskrivning</Text><TextInput value={description} onChangeText={setDescription} style={styles.i}/>
    <Text style={styles.l}>Typ (LÄXA/IDROTT/UTFLYKT/PROV)</Text><TextInput value={type} onChangeText={setType} style={styles.i}/>
    <Text style={styles.l}>Start (ISO)</Text><TextInput value={start} onChangeText={setStart} style={styles.i}/>
    <Text style={styles.l}>Slut (ISO)</Text><TextInput value={end} onChangeText={setEnd} style={styles.i}/>
    <TouchableOpacity style={styles.btn} onPress={onSave}><Text style={styles.bt}>Spara</Text></TouchableOpacity>
  </View>);
}
const styles=StyleSheet.create({c:{flex:1,padding:16,backgroundColor:'#0b1220'},t:{color:'white',fontSize:24,fontWeight:'800',marginBottom:12},l:{color:'#9ca3af',marginTop:8},i:{backgroundColor:'#111827',color:'white',padding:12,borderRadius:12,borderWidth:1,borderColor:'#374151'},btn:{backgroundColor:'#22c55e',marginTop:12,padding:14,borderRadius:12,alignItems:'center'},bt:{color:'white',fontWeight:'700'}});
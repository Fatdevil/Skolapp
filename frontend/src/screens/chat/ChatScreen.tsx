import React,{useEffect,useState} from 'react';
import {View,Text,FlatList,StyleSheet,TextInput,TouchableOpacity} from 'react-native';
import {getMessages,sendMessage} from '../../services/api';
export default function ChatScreen(){
  const [messages,setMessages]=useState<any[]>([]);
  const [text,setText]=useState('');
  const load=async()=>{ setMessages(await getMessages('class-1')); };
  useEffect(()=>{ load(); },[]);
  const onSend=async()=>{ if(!text.trim()) return; const msg=await sendMessage({classId:'class-1',text:text.trim()}); setMessages(p=>[msg,...p]); setText(''); };
  return(<View style={styles.c}>
    <Text style={styles.t}>Klasschatt</Text>
    <FlatList inverted data={[...messages].reverse()} keyExtractor={(i)=>i.id||Math.random().toString()} renderItem={({item})=>(
      <View style={[styles.b,item.flagged?{borderColor:'#ef4444'}:{}]}>
        <Text style={styles.a}>{item.sender_name||item.senderName}</Text>
        <Text style={styles.m}>{item.text}</Text>
        <Text style={styles.time}>{new Date(item.created_at||item.createdAt).toLocaleString()}</Text>
      </View>
    )} ListEmptyComponent={<Text style={styles.e}>Inga meddelanden ännu</Text>} />
    <View style={styles.row}><TextInput placeholder="Skriv..." placeholderTextColor="#6b7280" value={text} onChangeText={setText} style={styles.i}/>
      <TouchableOpacity style={styles.btn} onPress={onSend}><Text style={styles.bt}>Skicka</Text></TouchableOpacity>
    </View>
  </View>);
}
const styles=StyleSheet.create({c:{flex:1,padding:12,paddingBottom:72,backgroundColor:'#0b1220'},t:{color:'white',fontSize:24,fontWeight:'800',marginBottom:12},b:{backgroundColor:'#111827',padding:12,marginVertical:6,borderRadius:12,borderWidth:1,borderColor:'#374151'},a:{color:'#93c5fd',fontWeight:'700'},m:{color:'white',marginTop:4},time:{color:'#9ca3af',fontSize:12,marginTop:4},e:{color:'#9ca3af',textAlign:'center',marginTop:24},row:{position:'absolute',bottom:12,left:12,right:12,flexDirection:'row',alignItems:'center'},i:{flex:1,backgroundColor:'#111827',color:'white',padding:12,borderRadius:12,borderWidth:1,borderColor:'#374151',marginRight:8},btn:{backgroundColor:'#3b82f6',borderRadius:12,paddingHorizontal:16,paddingVertical:12},bt:{color:'white',fontWeight:'700'}});
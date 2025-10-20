import React from 'react'; import {View,Text,StyleSheet} from 'react-native';
export default function EventCard({event}:any){
  const start = new Date(event.start||event.START||event.start_time);
  const end   = new Date(event.end||event.END||event.end_time);
  return(<View style={[styles.card,{borderLeftColor:typeColor(event.type)}]}>
    <Text style={styles.title}>{event.title}</Text>
    <Text style={styles.subtitle}>{event.description}</Text>
    <Text style={styles.time}>{start.toLocaleString()} → {end.toLocaleTimeString()}</Text>
  </View>);
}
function typeColor(t:string){switch(t){case 'LÄXA':return'#22c55e';case 'IDROTT':return'#3b82f6';case 'UTFLYKT':return'#eab308';case 'PROV':return'#ef4444';default:return'#a78bfa';}}
const styles=StyleSheet.create({card:{backgroundColor:'#111827',padding:12,borderRadius:12,borderLeftWidth:4,marginVertical:6,borderColor:'#374151'},title:{color:'white',fontWeight:'800'},subtitle:{color:'#9ca3af',marginTop:4},time:{color:'#93c5fd',marginTop:6,fontSize:12}});
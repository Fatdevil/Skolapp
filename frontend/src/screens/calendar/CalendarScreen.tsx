import React,{useEffect,useState} from 'react';
import {View,Text,FlatList,StyleSheet,RefreshControl,TouchableOpacity} from 'react-native';
import {getEvents, deleteEvent} from '../../services/api';
import EventCard from '../../components/EventCard';
export default function CalendarScreen(){
  const [events,setEvents]=useState<any[]>([]);
  const [loading,setLoading]=useState(false);
  const load=async()=>{setLoading(true);try{setEvents(await getEvents('class-1'));}finally{setLoading(false);}}
  useEffect(()=>{load();},[]);
  return(<View style={styles.c}><Text style={styles.t}>Kalender</Text>
    <FlatList data={events} keyExtractor={(i)=>i.id||Math.random().toString()} refreshControl={<RefreshControl refreshing={loading} onRefresh={load}/>} renderItem={({item})=>(
      <View>
        <EventCard event={item}/>
        <TouchableOpacity onPress={async()=>{try{await deleteEvent(item.id); await load();}catch(e){alert('Radera kräver teacher/admin‑roll (sätt i Admin).');}}} style={{backgroundColor:'#ef4444',padding:8,borderRadius:8,marginTop:6,alignSelf:'flex-start'}}>
          <Text style={{color:'white'}}>Radera</Text>
        </TouchableOpacity>
      </View>
    )} ListEmptyComponent={<Text style={styles.e}>Inga händelser ännu</Text>} />
  </View>);
}
const styles=StyleSheet.create({c:{flex:1,padding:16,backgroundColor:'#0b1220'},t:{color:'white',fontSize:24,fontWeight:'800',marginBottom:12},e:{color:'#9ca3af',marginTop:24,textAlign:'center'}});
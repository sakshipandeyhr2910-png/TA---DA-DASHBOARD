import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, CheckCircle, Plus, Trash2, Upload,
  Plane, Train, Bus, Car, Clock, Info,
  Hotel, Loader2, AlertCircle, ExternalLink,
} from 'lucide-react';
import type { User } from '../types';
import { saveClaim, clearDraftWizard } from '../services/storageService';
import { formatDate, formatINR } from '../services/calculationEngine';
import { SUBMISSIONS_CLOSED } from '../config';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TravelLeg {
  id: string; mode: string; from: string; to: string;
  departureDate: string; arrivalDate: string; fare: number; currency: string; pnr: string;
  receipt: string;
}
interface CabEntry {
  id: string; date: string; from: string; to: string; amount: number; currency: string; receipt: string;
}
interface HotelStay {
  id: string; hotelName: string; checkIn: string; checkOut: string;
  ratePerNight: number; currency: string; stayType: string; receipt: string;
}
interface OtherExpense {
  id: string; category: string; description: string; date: string;
  amount: number; currency: string; receipt: string;
}
interface AdvanceRecord {
  id: string; label: string; amount: number; selected: boolean;
}

interface FormData {
  // Tab 1
  trainerName: string; empCode: string; department: string; baseCity: string;
  assignmentId: string; clientName: string; venue: string; country: string; city: string;
  assignmentStart: string; assignmentEnd: string;
  // Tab 2
  claimFrom: string; claimTo: string;
  travelLegs: TravelLeg[]; cabEntries: CabEntry[];
  // Tab 3
  leaveDates: string; staybackDates: string;
  hotelStays: HotelStay[]; otherExpenses: OtherExpense[];
  // Tab 4
  advances: AdvanceRecord[];
  // Tab 5
  remarks: string; declared: boolean;
}

const DEFAULT: FormData = {
  trainerName: '', empCode: '', department: '', baseCity: '',
  assignmentId: '', clientName: '', venue: '', country: 'India', city: '',
  assignmentStart: '', assignmentEnd: '',
  claimFrom: '', claimTo: '',
  travelLegs: [], cabEntries: [],
  leaveDates: '', staybackDates: '',
  hotelStays: [], otherExpenses: [],
  advances: [
    { id: 'adv1', label: 'ADV-2026-001 — Travel advance (May)', amount: 5000, selected: false },
    { id: 'adv2', label: 'ADV-2026-002 — Hotel advance (Pune)', amount: 8000, selected: false },
  ],
  remarks: '', declared: false,
};

const TABS = ['Trainer & Assignment', 'Travel Details', 'DA & Lodging', 'Advance & Summary', 'Preview & Submit'];
const MODES = ['Flight', 'Train', 'Bus', 'Cab', 'Own Vehicle'];
const STAY_TYPES = ['Self Booked', 'Company Provided', 'Apartment', 'Not Applicable'];
const EXP_CATS = ['Meal', 'Visa', 'Insurance', 'Internet', 'Laundry', 'Other'];

const CAB_ROUTES = [
  'Custom',
  'Home → Airport',
  'Airport → Home',
  'Airport → Venue',
  'Venue → Airport',
  'Venue → Accommodation',
  'Accommodation → Venue',
  'Accommodation → Airport',
  'Airport → Accommodation',
  'Hotel → Client Office',
  'Client Office → Hotel',
];

const COUNTRIES = [
  'Afghanistan','Albania','Algeria','Andorra','Angola','Argentina','Armenia','Australia',
  'Austria','Azerbaijan','Bahrain','Bangladesh','Belarus','Belgium','Bhutan','Bolivia',
  'Bosnia and Herzegovina','Botswana','Brazil','Brunei','Bulgaria','Cambodia','Cameroon',
  'Canada','Chile','China','Colombia','Costa Rica','Croatia','Cuba','Cyprus','Czech Republic',
  'Denmark','Dominican Republic','Ecuador','Egypt','El Salvador','Estonia','Ethiopia',
  'Finland','France','Georgia','Germany','Ghana','Greece','Guatemala','Honduras','Hungary',
  'Iceland','India','Indonesia','Iran','Iraq','Ireland','Israel','Italy','Jamaica','Japan',
  'Jordan','Kazakhstan','Kenya','Kuwait','Kyrgyzstan','Laos','Latvia','Lebanon','Libya',
  'Lithuania','Luxembourg','Malaysia','Maldives','Malta','Mexico','Moldova','Mongolia',
  'Morocco','Mozambique','Myanmar','Namibia','Nepal','Netherlands','New Zealand','Nicaragua',
  'Nigeria','North Korea','Norway','Oman','Pakistan','Palestine','Panama','Paraguay','Peru',
  'Philippines','Poland','Portugal','Qatar','Romania','Russia','Rwanda','Saudi Arabia',
  'Senegal','Serbia','Singapore','Slovakia','Slovenia','Somalia','South Africa','South Korea',
  'Spain','Sri Lanka','Sudan','Sweden','Switzerland','Syria','Taiwan','Tajikistan','Tanzania',
  'Thailand','Tunisia','Turkey','Turkmenistan','Uganda','Ukraine','United Arab Emirates',
  'United Kingdom','United States','Uruguay','Uzbekistan','Venezuela','Vietnam','Yemen',
  'Zambia','Zimbabwe',
];

// ─── Training Delivery Inhouse employees (api_key 236, codes 1–7500) ─────────
const TDI_EMPLOYEES: { code: string; name: string; city: string; email: string; desig: string }[] = [
  {code:'139',name:'Rajesh Kumar Gogia',city:'Delhi',email:'rajesh.gogia@koenig-solutions.com',desig:'Iconic Trainer & SME'},
  {code:'207',name:'Girish Kumar',city:'Delhi',email:'girish.kumar@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'229',name:'Digvijay Prasad',city:'Gorakhpur',email:'digvijay.prasad@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'307',name:'Sachin Chauhan',city:'Shimla',email:'sachin.chauhan@koenig-solutions.com',desig:'Technical Lead'},
  {code:'351',name:'Prabin Singh',city:'Bangalore',email:'prabin.singh@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'519',name:'Akshay Kumar',city:'Delhi',email:'akshay.kumar@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'753',name:'Vibhor Bhardwaj',city:'Delhi',email:'vibhor.bhardwaj@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'760',name:'Nityanand Thakur',city:'Delhi',email:'nityanand.thakur@koenig-solutions.com',desig:'Iconic Trainer & SME'},
  {code:'802',name:'Sanjeev Kumar',city:'Delhi',email:'sanjeev.kumar@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'824',name:'Tarun Patial',city:'Delhi',email:'tarun.patial@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'844',name:'Manish Kumar',city:'Delhi',email:'manish.kumar@koenig-solutions.com',desig:'Assistant Technical Manager'},
  {code:'903',name:'Dipankar Bhardwaj',city:'Delhi',email:'dipankar.bhardwaj@koenig-solutions.com',desig:'Iconic Trainer & SME'},
  {code:'924',name:'Vimal Kumar Singh',city:'Delhi',email:'vimal.singh@koenig-solutions.com',desig:'Team Lead'},
  {code:'1227',name:'Gaurav Kumar Joshi',city:'Dehradun',email:'gaurav.joshi@koenig-solutions.com',desig:'Assistant Technical Manager'},
  {code:'1231',name:'Prashant Ranjan',city:'Delhi',email:'prashant.ranjan@koenig-solutions.com',desig:'Assistant Technical Manager'},
  {code:'1247',name:'Sandeep Singh',city:'Delhi',email:'sandeep.singh@koenig-solutions.com',desig:'Assistant Technical Manager'},
  {code:'1253',name:'Devpriyam Sharma',city:'Delhi',email:'devpriyam.sharma@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'1267',name:'Vishal Bhatia',city:'Delhi',email:'vishal.bhatia@koenig-solutions.com',desig:'Technical Lead'},
  {code:'1297',name:'Praveen Kumar',city:'Ghaziabad',email:'praveen.kumar@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'1368',name:'Vatan Vijaykumar Joshi',city:'Shimla',email:'vatan.joshi@koenig-solutions.com',desig:'Assistant Technical Manager'},
  {code:'1407',name:'Rakesh Kumar',city:'Delhi',email:'rakesh.kumar@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'1529',name:'Indu Bhushan Saxena',city:'Delhi',email:'Indubhushan.saxena@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'1539',name:'Shruti Gupta',city:'Delhi',email:'shruti.gupta@koenig-solutions.com',desig:'Assistant Technical Manager'},
  {code:'1545',name:'Ashwin Sam Koshy',city:'Delhi',email:'Ashwin.koshy@koenig-solutions.com',desig:'Assistant Technical Manager'},
  {code:'1563',name:'Prem Sharma',city:'Delhi',email:'premnidhi.sharma@koenig-solutions.com',desig:'Technical Lead'},
  {code:'1564',name:'Nishant Harshwardhan',city:'Delhi',email:'nishant.harshwardhan@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'1573',name:'Ravi Kumar',city:'Delhi',email:'ravi.kumar@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'1577',name:'Simmi Anand',city:'Delhi',email:'simmi.anand@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'1653',name:'Ravi Sharma',city:'Delhi',email:'ravi.sharma1@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'1684',name:'Surjeet Singh Tomer',city:'Delhi',email:'surjeet.tomer@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'1689',name:'Abhishek Soni',city:'Bangalore',email:'abhishek.soni@koenig-solutions.com',desig:'Assistant Technical Manager'},
  {code:'1731',name:'Saurabh Srivastava',city:'Delhi',email:'saurabh.srivastava@koenig-solutions.com',desig:'Technical Lead'},
  {code:'1761',name:'Rohit Bahl',city:'Delhi',email:'rohit.bahl@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'1771',name:'Sudhir Kumar Deswal',city:'Delhi',email:'sudhir.deswal@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'1781',name:'Vinod Kumar',city:'Rohtak',email:'vinod.kumar@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'1899',name:'Sujay Das',city:'Delhi',email:'sujay.das@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'2030',name:'Aloysious Ambrose',city:'Bangalore',email:'aloysious.ambrose@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'2031',name:'Abhijit Dey',city:'Bangalore',email:'abhijit.dey@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2114',name:'Nirbhai Singh Chauhan',city:'Delhi',email:'nirbhai.chauhan@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2116',name:'Prabhat Singh',city:'Delhi',email:'prabhat.singh@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'2125',name:'Saroj Mala',city:'Delhi',email:'saroj.mala@koenig-solutions.com',desig:'Assistant Technical Manager'},
  {code:'2128',name:'Subhendu Mukherjee',city:'Delhi',email:'subhendu.mukherjee@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2132',name:'Gajendra Choudhary',city:'Delhi',email:'gajendra.choudhary@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2135',name:'Nitika Gupta',city:'Delhi',email:'nitika.gupta@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2157',name:'Anmol Agrawal',city:'Delhi',email:'anmol.agrawal@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2165',name:'Sunny Sirohi',city:'Ghaziabad',email:'sunny.sirohi@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2178',name:'Ankit Kumar Malik',city:'Delhi',email:'ankit.malik@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2188',name:'Shova Kant Sharma',city:'Delhi',email:'shova.sharma@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'2192',name:'Piyush Bhatia',city:'Delhi',email:'Piyush.Bhatia@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2203',name:'Kuldeep Singh',city:'Delhi',email:'Kuldeep.Singh@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'2216',name:'Archna Dhyani',city:'Delhi',email:'Archna.Dhyani@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2225',name:'Manohar Reddy Patlolla',city:'Bangalore',email:'Patlolla.Reddy@koenig-solutions.com',desig:'Technical Lead'},
  {code:'2236',name:'Gurdeep Singh Sandhu',city:'Patiala',email:'gurdeep.singh@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'2263',name:'Gurjeet Singh',city:'Delhi',email:'gurjeet.singh@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'2279',name:'Krishna Kartheek Kondepudi',city:'Kakinada',email:'krishna.kartheek@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2290',name:'Deepanshu Deepanshu',city:'Delhi',email:'deepanshu.k@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2291',name:'Sandeep Tiwari',city:'Delhi',email:'sandeep.tiwari@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2298',name:'Karishma Talreja',city:'Delhi',email:'karishma.talreja@koenig-solutions.com',desig:'Assistant Technical Manager'},
  {code:'2304',name:'Anusha Ponnusamy',city:'Chennai',email:'anusha.p@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'2309',name:'Damini Sabharwal',city:'Delhi',email:'Damini.Sabharwal@koenig-solutions.com',desig:'Assistant Technical Manager'},
  {code:'2335',name:'Shifali Sharma',city:'Chandigarh',email:'Shifali.Sharma@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'2337',name:'Joel Isaac Ananda Raj',city:'Bangalore',email:'Joel.isaac@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2347',name:'Varun Godiyal',city:'Noida',email:'Varun.Godiyal@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'2348',name:'Vibhor Raju Sharma',city:'Nagpur',email:'Vibhor.Sharma@koenig-solutions.com',desig:'Assistant Technical Manager'},
  {code:'2356',name:'Manjunath Seenappa',city:'Bangalore',email:'MANJUNATHA.S@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2359',name:'Sk Nazrul Islam',city:'Kolkata',email:'nazrul.islam@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2361',name:'Vaibhav Gupta',city:'Delhi',email:'Vaibhav.Gupta@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2367',name:'Yogesh Meherwade',city:'Mumbai',email:'Yogesh.Mohan@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2377',name:'Avinash Chandra Tiwari',city:'Gorakhpur',email:'Avinash.Chandra@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2380',name:'Bhavesh Vijay Pali',city:'Nagpur',email:'Bhavesh.pali@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2381',name:'Tapos Mondal',city:'Hyderabad',email:'Tapos.Mondal@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2384',name:'Sreemanta Das',city:'Kolkata',email:'Sreemanta.Das@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'2388',name:'Akwinder Kaur',city:'Delhi',email:'Akwinder.Kaur@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'2390',name:'Jeetendra Khelani',city:'Pune',email:'Jeetendra.Khelani@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2392',name:'Himanshu Sharma',city:'Agra',email:'Himanshu.Sharma@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2395',name:'Karanveer Singh',city:'Jalandhar',email:'Karanveer.Singh@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2400',name:'Hardik Tike',city:'Mumbai',email:'hardik.tike@koenig-solutions.com',desig:'Assistant Technical Manager'},
  {code:'2502',name:'Sachin Chouhan',city:'Saharanpur',email:'Sachin.Chauhan1@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2503',name:'Sushma Sharma',city:'New Delhi',email:'Sushma.Sharma@koenig-solutions.com',desig:'Assistant Technical Manager'},
  {code:'2511',name:'Mohammad Farhan',city:'Mumbai',email:'Mohd.Farhan@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2517',name:'Deepak Jaju',city:'Mumbai',email:'Deepak.Jaju@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'2523',name:'Himanshu Srivastava',city:'Noida',email:'Himanshu.Srivastava@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2524',name:'Sukhwinder Singh',city:'Ludhiana',email:'Sukhwinder.Singh@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2525',name:'Kannan Manoharan',city:'Kumbakonam',email:'Kannan.Manoharan@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2540',name:'Kanav Jain',city:'Ludhiana',email:'Kanav.Jain@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2565',name:'Amar Nath Mishra',city:'Kolkata',email:'Amarnath.Mishra@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2568',name:'Pavan Kumar Bh',city:'Bangalore',email:'Pavan.Kumar@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2569',name:'Harshita Maurya',city:'Lucknow',email:'Harshita.Maurya@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2570',name:'Vijit Bhansali',city:'Kolkata',email:'Vijit.Bhansali@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2571',name:'Ankur Upadhyay',city:'Mumbai',email:'Ankur.Upadhyay@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2585',name:'Muddasir Mahadik',city:'Mumbai',email:'Muddasir.Mahadik@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'2586',name:'Farha Abdul Razzak',city:'Mumbai',email:'Farha.Shaikh@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'2590',name:'Priyanka Verma',city:'Kolkata',email:'Priyanka.Verma@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2602',name:'Shivam Soni',city:'Jabalpur',email:'Shivam.Soni@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2603',name:'Pranav Kamble',city:'Kolhapur',email:'Pranav.Kamble@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2607',name:'Shruti Kulshrestha',city:'Dubai',email:'Shruti.Kulshreshta@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2609',name:'Dhruv Parekh',city:'Mumbai',email:'Dhruv.Parekh@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2612',name:'Vyshnavi Nizampuram',city:'Hyderabad',email:'Vyshnavi.Amradhi@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2613',name:'Shahid Hamid',city:'Mumbai',email:'Shahid.Hamid@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2624',name:'Vaibhav Doshi',city:'Udaipur',email:'Vaibhav.Doshi@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2631',name:'Kaveri Sawant',city:'Mumbai',email:'Kaveri.Sawant@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2633',name:'Arshad Qureshi',city:'Mumbai',email:'Arshad.Qureshi@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2634',name:'Ananay Ojha',city:'Kanpur',email:'Ananay.Ojha@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2635',name:'Parveen Mor',city:'Gurgaon',email:'Parveen.Mor@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2639',name:'Nehal Ahmed Kasmani',city:'Mumbai',email:'Nehal.Ahmed@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2641',name:'Roma Chowhan',city:'Nasik',email:'Roma.Chowhan@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2645',name:'Dinesh Tiwari',city:'Mumbai',email:'Dinesh.Tiwari@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2652',name:'Deepanshu Kumar',city:'Delhi',email:'DEEPANSHU.KUMAR@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'2658',name:'Sanchita Dixit',city:'Delhi',email:'Sanchita.Dixit@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2664',name:'Sana Haroon Rashid',city:'Mumbai',email:'Sana.Haroon@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2672',name:'Sirppy Pasamalar',city:'Chennai',email:'Sirppy.Pasamalar@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2684',name:'Manikandan N',city:'Coimbatore',email:'Manikandan.N@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2689',name:'Snehal Sawant',city:'Mumbai',email:'Snehal.Sawant@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2690',name:'Nisha Varghese',city:'Mumbai',email:'Nisha.Varghese@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2694',name:'Swati Nagare',city:'Ahmednagar',email:'Swati.Nagare@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2695',name:'Ramya M',city:'Coimbatore',email:'Ramya.Marudachalam@koenig-solutions.com',desig:'Assistant Technical Manager'},
  {code:'2697',name:'Shubhika Singh',city:'Meerut',email:'Shubhika.Singh@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2699',name:'Avni Sharma',city:'Ghaziabad',email:'Avni.Sharma@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2702',name:'Saijal Dahiya',city:'Ghaziabad',email:'Saijal.Dahiya@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2704',name:'Raushan Ranjan',city:'Noida',email:'Raushan.Ranjan@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'2707',name:'Kshitiz Raghuvanshi',city:'Meerut',email:'Kshitiz.Raghuvanshi@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2709',name:'Monika Ahlawat',city:'Delhi',email:'Monika.Ahlawat@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2712',name:'Abdul Mateen',city:'Delhi',email:'Abdul.Mateen@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2713',name:'K M Bilvika',city:'Bangalore',email:'Km.Bilvika@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2730',name:'Vishal Tekwani',city:'Pune',email:'Vishal.Tekwani@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2733',name:'Sucheta Dalal',city:'Ujjain',email:'Sucheta.Dalal@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2736',name:'Ajaypal Singh',city:'Mohali',email:'Ajaypal.Singh@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2739',name:'Nikhil Gupta',city:'Lucknow',email:'Nikhil.Gupta@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2742',name:'Swapnil Soner',city:'Indore',email:'Swapnil.Soner@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2749',name:'Vikas Hangloo',city:'Ghaziabad',email:'VIKAS.HANGLOO@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2752',name:'Anish Samy',city:'Tanjore',email:'Anish.Samy@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2754',name:'Neelanjana Mukerji',city:'New Delhi',email:'Neelanjana.Mukerji@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2758',name:'Sonia Chhabra',city:'Noida',email:'Sonia.Chhabra@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2761',name:'Varsha Kure',city:'Bangalore',email:'Varsha.Kure@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2762',name:'Swati Kumari',city:'Kolkata',email:'Swati.Kumari@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2767',name:'Syed Ali',city:'Raipur',email:'Zishan.Ali@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2771',name:'Richa Singh',city:'Delhi',email:'Richa.Choudhary@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2794',name:'Soniya Rana',city:'Mumbai',email:'Soniya.Rana@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2801',name:'Shailesh Saxena',city:'Bhopal',email:'Shailesh.Saxena@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2802',name:'Bailappa Bhovi',city:'Bangalore',email:'Bailappa.Bhovi@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2804',name:'Pranav Sharma',city:'Jammu',email:'Pranav.Sharma1@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2808',name:'Mohammad Anash',city:'Meerut',email:'Mohommad.Anash@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2817',name:'Amandeep Kaur',city:'Ambala',email:'Amandeep.Kaur@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2824',name:'Yashaswini Srinivasan',city:'Bangalore',email:'Yashaswini.Srinivasan@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2841',name:'Aishwarya Rajput',city:'Faridabad',email:'Aishwarya.Rajput@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2845',name:'Pooja Sharma',city:'Thane',email:'Pooja.Sharma1@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2849',name:'Kaveri Kaur',city:'Mohali',email:'Kaveri.Kaur@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2859',name:'Rohit Chahande',city:'Nagpur',email:'Rohit.Chahande@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2862',name:'Madhushruti Sharma',city:'Kolkata',email:'Madhushruti.Sharma@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2866',name:'Shahhista Sayyed',city:'Mumbai',email:'Shahhista.Sayyed@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2867',name:'Vinithson Jeremiah',city:'Chennai',email:'Vinithson.Jeremiah@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'2893',name:'Abhishek Pratap',city:'Gandhinagar',email:'Abhishek.Pratap@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'2896',name:'Sania Mutreja',city:'Delhi',email:'Sania.Mutreja@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'3001',name:'Kanika Arora',city:'Noida',email:'Kanika.Arora@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3002',name:'Sourabh Jain',city:'Indore',email:'Sourabh.Jain@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'3003',name:'Bharatkumar Bhojwani',city:'Vadodara',email:'Bharat.Bhojwani@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'3006',name:'Pradeep Garg',city:'Mandi',email:'Pradeep.Garg@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3011',name:'Abhishek Kushwaha',city:'Varanasi',email:'Abhishek.Kushwaha@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3012',name:'Vidhya Sudarsanan',city:'Chennai',email:'Vidhya.Kishore@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3033',name:'Rahul Nandy',city:'Kolkata',email:'Rahul.Nandy@koenig-solutions.com',desig:'Assistant Technical Manager'},
  {code:'3037',name:'Saumitra Kulkarni',city:'Pune',email:'Saumitra.Kulkarni@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3047',name:'Pragya Jain',city:'Surat',email:'Pragya.Jain@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3051',name:'Amit Bijalwan',city:'Dehradun',email:'Amit.Bijalwan@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'3055',name:'Radhakrishna Lambu',city:'Bangalore',email:'Radhakrishna.Lambu@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3056',name:'Rashmi Sharma',city:'Ghaziabad',email:'Rashmi.Sharma1@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3082',name:'Praveena R',city:'Erode',email:'PRAVEENA.SELVAM@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3085',name:'Karthik Es',city:'Coimbatore',email:'Karthik.ES@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3088',name:'Pavan Pari',city:'Kadapa',email:'Pavan.Pari@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3114',name:'Sonali Sharma',city:'Pondicherry',email:'Sonali.Sharma@koenig-solutions.com',desig:'Corporate Trainer - Security'},
  {code:'3119',name:'Vijay Kumar',city:'Ambala',email:'Vijay.Kumar@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3124',name:'Shilpi Arora',city:'Noida',email:'Shilpi.Arora@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3126',name:'Aditi Sharma',city:'Bangalore',email:'Aditi.Sharma@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3130',name:'Tarandeep Kaur',city:'Hyderabad',email:'Tarandeep.Gujral@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'3150',name:'Sameer Kamble',city:'Mumbai',email:'SAMEER.KAMBLE@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3152',name:'Sanjay Kumar Patel',city:'Hyderabad',email:'sanjay.patel@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3154',name:'Prerna Talwar',city:'Delhi',email:'Prerna.Talwar@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'3161',name:'Aman Rajput',city:'Delhi',email:'Aman.Rajput@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'3162',name:'Akansha Nehra',city:'Delhi',email:'Akansha.Nehra@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3171',name:'Roohi Belur Raheem',city:'Mangalore',email:'Roohi.Raheem@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'3172',name:'Malathi Murugesan',city:'Coimbatore',email:'Malathi.Murugesan@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'3173',name:'Tejasav Sah',city:'Noida',email:'TEJASAV.SAH@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3175',name:'Manjari Sharma',city:'Gurgaon',email:'Manjari.Sharma@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3176',name:'Amit Kumar',city:'Gurgaon',email:'kumar.amit@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3179',name:'Nidhi Nayak',city:'Udupi',email:'Nidhi.Nayak@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'3180',name:'Kannan S',city:'Mumbai',email:'Kannan.Sudhakaran@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'3181',name:'Anupam Thukral',city:'New Delhi',email:'Anupam.Thukral@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'3182',name:'Mohd Farhan Siddiqui',city:'Lucknow',email:'Farhan.Siddiqui@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3183',name:'Vijay Jagadeesh Balde',city:'Kalaburagi',email:'Vijay.JB@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3187',name:'Ranjith Ramachandran',city:'Chennai',email:'Ranjith.Kumar@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3191',name:'Anshu Batra',city:'Nagpur',email:'Anshu.Batra@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3192',name:'Vaibhav Prakash',city:'Patna',email:'Vaibhav.Prakash@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'3200',name:'Kratika Sharma',city:'Hyderabad',email:'Kratika.Sharma@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3210',name:'Imran Ali',city:'Tumkur',email:'Imran.Ali@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3214',name:'Pratik Khuthia',city:'Thane',email:'Pratik.Khuthia@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'3216',name:'Aastha Jain',city:'Udaipur',email:'Aastha.Jain@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3217',name:'Sandeep Joshi',city:'Bangalore',email:'Sandeep.Joshi@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'3218',name:'Shalini Raghuwanshi',city:'Indore',email:'Shalini.Raghuwanshi@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'3220',name:'Rukhsar Khureshi',city:'Mumbai',email:'Rukhsar.Khureshi@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3221',name:'Vanshika Chaudhary',city:'Dehradun',email:'Vanshika.Chaudhary@koenig-solutions.com',desig:'Trainee Trainer'},
  {code:'3222',name:'Aakriti Rawat',city:'Pune',email:'Aakriti.Rawat@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3224',name:'Pauroosh Kaushal',city:'Pune',email:'Pauroosh.Kaushal@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'3227',name:'Aishwar Nigam',city:'Jhansi',email:'Aishwar.C@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'3234',name:'Samira Nigrel',city:'Mumbai',email:'Samira.Nigrel@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'3235',name:'Samina Shaikh',city:'Pune',email:'Samina.Shaikh@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'3236',name:'Saravanan Ramaraj',city:'Bangalore',email:'Sarvanan.Ramraj@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3257',name:'Ashok Kumar Srinivasan',city:'Coimbatore',email:'Ashok.S@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'3261',name:'Sana Sayyed',city:'Pune',email:'Sana.Sayyed@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3262',name:'Abhay Sharma',city:'Meerut',email:'Abhay.Sharma@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3270',name:'Jasleen Kaur',city:'Ropar',email:'Jasleen.Kaur@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3273',name:'Kaiser Abbas Gazi',city:'Srinagar',email:'Kaiser.Gazi@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3275',name:'Anureet Kaur',city:'Jhansi',email:'Anureet.Kaur@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'3288',name:'Rojin Thomas',city:'Kannur',email:'rojin.thomas@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3289',name:'Satish Gangwani',city:'Nagpur',email:'Satish.Gangwani@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'3293',name:'Arun Kumar Jangid',city:'Jaipur',email:'Arun.jangid@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3297',name:'Sandeep Charugundla',city:'Hyderabad',email:'sandeep.charugundla@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3312',name:'Umesh Kumar',city:'Kurukshetra',email:'Umesh.Dhiman@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3315',name:'Krishna Dwivedi',city:'Thane',email:'Krishna.Dwivedi@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'3317',name:'Shruti Chhabra',city:'Delhi',email:'Shruti.Chhabra@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'3318',name:'Deepti Shastri',city:'Indore',email:'Deepti.Shastri@koenig-solutions.com',desig:'Iconic Trainer'},
  {code:'3320',name:'Deepu Thomas',city:'Palakkad',email:'Deepu.Thomas@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3503',name:'Pydipitla Karunakar',city:'Nizamabad',email:'Karunakar.Pydipitla@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3504',name:'Aswani Sudha',city:'Bangalore',email:'Aswani.Nair@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3505',name:'Bhavna Singh',city:'Mohali',email:'Bhavna.Singh@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3511',name:'Neeraj Pathak',city:'Varanasi',email:'Neeraj.Pathak@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3512',name:'Vishakha Sharma',city:'Noida',email:'Vishakha.Sharma@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3515',name:'Swaroop R Nayaka',city:'Bangalore',email:'Swaroop.Nayaka@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3517',name:'Divya G',city:'Chennai',email:'divya.ganesan@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3518',name:'Jagmeet Singh',city:'Delhi',email:'jagmeet.singh@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3519',name:'Lipika Sharma',city:'Bhopal',email:'Lipika.Sharma@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3522',name:'Anuradha Deshpande',city:'San Francisco',email:'anuradha.deshpande@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3523',name:'Kanchan Sundarani',city:'Bhopal',email:'Kanchan.Sundarani@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3525',name:'Nikhil Pal',city:'Delhi',email:'Nikhil.Pal@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3526',name:'Sarath G',city:'Ernakulam',email:'Sarath.Gangadharan@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3527',name:'Swathi Raj',city:'Mysore',email:'Swathi.Raj@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3529',name:'Silas Enefiok',city:'Lagos',email:'Silas.Enefiok@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3531',name:'Abhishek Thakur',city:'Hyderabad',email:'Abhishek.Singh@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3534',name:'Samruddhi Kotibhaskar',city:'Thane',email:'Samruddhi.Kotibhaskar@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3535',name:'Raman Puneet Singh',city:'Mohali',email:'Raman.Singh@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3537',name:'Manjiri Tilak',city:'Pune',email:'Manjiri.Tilak@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3538',name:'Monica Kumari',city:'Bangalore',email:'Monica.Kumari@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3541',name:'Saema Ambareen Qazi',city:'Delhi',email:'Saema.Qazi@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3543',name:'Drashtiben Devmurari',city:'Palitana',email:'Drashti.Devmurari@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3546',name:'Pauline Namwakira',city:'Nairobi',email:'pauline.namwakira@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3548',name:'Olasunmibo Joel Akerele',city:'Lagos',email:'joel.akerele@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3549',name:'Siddhant Sharma',city:'Ghaziabad',email:'Siddhant.Sharma@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3555',name:'Snehal Modi',city:'Bangalore',email:'snehal.modi@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3556',name:'Pradeep B',city:'Hyderabad',email:'Pradeep.B@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3557',name:'Chinechetam Okafor',city:'Lagos',email:'Chinechetam.Okafor@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3561',name:'Anup Sharma',city:'Delhi',email:'Anup.Sharma@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3565',name:'Pramila Chandraiah',city:'Bangalore',email:'Pramila.C@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3566',name:'Arjun Kumar Jain',city:'Agra',email:'arjun.jain@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3567',name:'Alok Raj',city:'Gurgaon',email:'Alok.Raj@koenig-solutions.com',desig:'Trainee Trainer'},
  {code:'3569',name:'Pawan Kumar',city:'New Delhi',email:'Pawan.Kumar@koenig-solutions.com',desig:'Trainee Trainer'},
  {code:'3570',name:'Vibhor Verma',city:'Ghaziabad',email:'Vibhor.Verma@koenig-solutions.com',desig:'Trainee Trainer'},
  {code:'3571',name:'Amolik Blesson Singh',city:'Delhi',email:'Amolik.Singh@koenig-solutions.com',desig:'Trainee Trainer'},
  {code:'3574',name:'Mohammed Ahmed',city:'Cairo',email:'Mohammed.Ahmed@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3577',name:'Amit Kumar Mishra',city:'Delhi',email:'Amit.Mishra1@koenig-solutions.com',desig:'Trainee Trainer'},
  {code:'3578',name:'Amulya Singh',city:'Ghaziabad',email:'Amulya.Singh@koenig-solutions.com',desig:'Trainee Trainer'},
  {code:'3579',name:'Bratati Mandal',city:'Delhi',email:'Bratati.Mandal@koenig-solutions.com',desig:'Trainee Trainer'},
  {code:'3580',name:'Shagun Chadak',city:'Chandigarh',email:'Shagun.Chadak@koenig-solutions.com',desig:'Trainee Trainer'},
  {code:'3586',name:'Shrey Saxena',city:'Gurgaon',email:'Shrey.Saxena@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3588',name:'Rahul Biswa',city:'Gurgaon',email:'Rahul.Biswa@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3592',name:'Nimisha Mohan',city:'Coimbatore',email:'Nimisha.Mohan@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3594',name:'Shoaib Peer',city:'Srinagar',email:'Shoaib.Peer@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3595',name:'Elvis Kobby Bessah',city:'Accra',email:'Elvis.Bessah@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3602',name:'Gauri Yadav',city:'Vadodara',email:'Gauri.Yadav@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3605',name:'Santhosh Dhanapal',city:'Chennai',email:'santhosh.dhanapal@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3606',name:'Usama Tabish Mohammed',city:'Anantapur',email:'Mohammed.Tabish@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3612',name:'Utkarsh Prajapati',city:'Indore',email:'Utkarsh.Prajapati@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3622',name:'Salik Hayat Makhmoor',city:'Purnia',email:'Salik.Makhmoor@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3624',name:'Pratibha Poddar',city:'Ghaziabad',email:'Pratibha.Poddar@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3625',name:'Prachi Arora',city:'Delhi',email:'prachi.arora@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3626',name:'Aman Kumar',city:'New Delhi',email:'Aman.Kumar@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3634',name:'Salman Shafiq Khan',city:'Srinagar',email:'Salman.Khan@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3639',name:'Soumik Purkayastha',city:'Paris',email:'Soumik.Das@koenig-solutions.com',desig:'Senior Corporate Trainer'},
  {code:'3640',name:'Magesh Kumar Palani',city:'Chennai',email:'magesh.p@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3642',name:'Geetansh Goyal',city:'Jaipur',email:'Geetansh.Goyal@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3643',name:'Sarath Ramachandran',city:'Thrissur',email:'Sarath.PR@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3644',name:'Idrees Ali',city:'Bundi',email:'Idrees.Ali@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3650',name:'Archita Singh',city:'Lucknow',email:'Archita.Singh@koenig-solutions.com',desig:'Trainee Trainer'},
  {code:'3651',name:'Anshika Srivastava',city:'Varanasi',email:'Anshika.Srivastava@koenig-solutions.com',desig:'Trainee Trainer'},
  {code:'3653',name:'Aayush Kaushik',city:'Delhi',email:'Aayush.Kaushik@koenig-solutions.com',desig:'Trainee Trainer'},
  {code:'3654',name:'Aditya Rana',city:'Delhi',email:'Aditya.Rana@koenig-solutions.com',desig:'Trainee Trainer'},
  {code:'3658',name:'Rushabh Shah',city:'Ahmedabad',email:'Rushabh.Shah@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3661',name:'Uday Banerjee',city:'Saharanpur',email:'Uday.Banerjee@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3662',name:'Prajakta Landge',city:'Pune',email:'Prajakta.Landge@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3668',name:'Sivakumar Perumal',city:'Madurai',email:'Sivakumar.P@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3670',name:'Hitesh Popat',city:'Bhopal',email:'Hitesh.Popat@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3671',name:'Mehak Syed Qureshi',city:'Srinagar',email:'Mehak.Qurashi@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3676',name:'Persis Anil',city:'Delhi',email:'Persis.Anil@koenig-solutions.com',desig:'Trainee Trainer'},
  {code:'3677',name:'Justice Boateng',city:'Accra',email:'Justice.Boateng@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3678',name:'Marwan Mokhtar',city:'Alexandria',email:'Marwan.Mokhtar@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3681',name:'Aastha Mehta',city:'Delhi',email:'Aastha.Mehta@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3689',name:'Sanith Mohan',city:'New Delhi',email:'Sanith.Mohan@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3691',name:'Prasiddh Saxena',city:'Gurgaon',email:'prasiddh.saxena@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3693',name:'Sourabh Singh',city:'Mohali',email:'Sourabh.Singh@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3694',name:'Rishi Rohra',city:'Mumbai',email:'Rishi.Rohra@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3697',name:'Umang Suthar',city:'Delhi',email:'Umang.Suthar@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3698',name:'Shivani Singh',city:'Kanpur',email:'Shivani.Singh@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3699',name:'Padmapriyanka Balakrishnan',city:'Chennai',email:'Padma.CB@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3705',name:'Courage Tafadzwa Magadu',city:'Bristol',email:'Courage.Magadu@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3706',name:'Utkalika Kundu',city:'Mumbai',email:'Utkalika.Kundu@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3707',name:'Trapti Jha',city:'Noida',email:'Trapti.Jha@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3708',name:'Frank Ilemona Oguche',city:'Lagos',email:'Frank.Oguche@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3709',name:'Sagar Bhure',city:'Kalaburagi',email:'Sagar.Bhure@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3712',name:'Prachi Mandloi',city:'Khargone',email:'Prachi.Mandloi@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3713',name:'Saheed Ojewumi',city:'Lagos',email:'Saheed.Ojewumi@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3714',name:'Kavitha Varthya',city:'Hyderabad',email:'Kavitha.Varthya@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3715',name:'Chavi Sehgal',city:'Varanasi',email:'Chavi.Sehgal@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3718',name:'Vasim Syed',city:'Hyderabad',email:'Syed.Vasim@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3722',name:'Rajat Upadhyay',city:'Jaipur',email:'Rajat.Upadhyay@koenig-solutions.com',desig:'Trainee Trainer'},
  {code:'3723',name:'Anushree Anand',city:'Ranchi',email:'Anushree.Anand@koenig-solutions.com',desig:'Trainee Trainer'},
  {code:'3724',name:'Aditya Singh',city:'Allahabad',email:'Aditya.Singh1@koenig-solutions.com',desig:'Trainee Trainer'},
  {code:'3726',name:'T Tanusree',city:'Kharagpur',email:'T.Tanusree@koenig-solutions.com',desig:'Trainee Trainer'},
  {code:'3727',name:'Ankit Singh Gusain',city:'Dehradun',email:'Ankit.Gusain@koenig-solutions.com',desig:'Trainee Trainer'},
  {code:'3728',name:'Sagar Sood',city:'Solan',email:'Sagar.Sood@koenig-solutions.com',desig:'Trainee Trainer'},
  {code:'3729',name:'Aarush Kashyap',city:'Shimla',email:'Aarush.Kashyap@koenig-solutions.com',desig:'Trainee Trainer'},
  {code:'3730',name:'Puneeta Chaturvedi',city:'Abu Road',email:'Puneeta.Chaturvedi@koenig-solutions.com',desig:'Trainee Trainer'},
  {code:'3734',name:'Kavita Kapoor',city:'New Delhi',email:'Kavita.Kapoor@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3737',name:'Syed Quaid Hussain',city:'Moradabad',email:'Syed.Hussain@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3738',name:'Martina Wagih Adly Boules',city:'Cairo',email:'Martina.Wagih@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3739',name:'Westley Van Straten',city:'Pretoria',email:'westley.vanstraten@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3741',name:'Augustine Ubong',city:'Lagos',email:'Augustine.Ubong@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3742',name:'Neda Mohammed',city:'Dubai',email:'Neda.Hasan@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3747',name:'Kowsik Ruttala',city:'Visakhapatnam',email:'Ruttala.Kowsik@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3755',name:'Kavitha Kumaraswamy',city:'Mysore',email:'Kavitha.Keerthi@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3762',name:'Babajan Tamboli',city:'Pune',email:'Babajan.Tamboli@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3763',name:'Ifrah Juikar',city:'Khed',email:'Ifrah.Juikar@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3766',name:'Aditi Mishra',city:'Bettiah',email:'Aditi.Mishra@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3769',name:'Suresh Venkatachalam',city:'Bangalore',email:'Suresh.V@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3770',name:'Aditya Pathak',city:'Ghaziabad',email:'Aditya.Pathak@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3771',name:'Vivekanand Gitte',city:'Pune',email:'Vivekanand.Gitte@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3773',name:'Jayesh Rohilla',city:'Noida',email:'Jayesh.Rohilla@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3774',name:'Tanya Oberoi',city:'Delhi',email:'Tanya.Oberoi@koenig-solutions.com',desig:'Trainee Trainer'},
  {code:'3775',name:'Akash Mehndiratta',city:'Mohali',email:'akash.mehndiratta@koenig-solutions.com',desig:'Assistant Technical Manager'},
  {code:'3776',name:'Virendra Sharma',city:'Delhi',email:'Virendra.Sharma@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3786',name:'Pallavi Katari',city:'Coimbatore',email:'Pallavi.Katari@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3787',name:'Sajiyabanu Salat',city:'Rajkot',email:'Sajiyah.Salat@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3788',name:'Vaibhav Agarwal',city:'Bhiwadi',email:'Vaibhav.Agarwal@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3793',name:'Poojitha Junuthula',city:'Hyderabad',email:'Poojitha.Junuthula@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3794',name:'Victor Oguche',city:'Abuja',email:'Victor.Oguche@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3800',name:'Manosh N',city:'Bangalore',email:'Manosh.N@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3801',name:'Philip Nwachukwu',city:'Lagos',email:'PHILIP.NWACHUKWU@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3802',name:'Sourabh Sengupta',city:'Jabalpur',email:'Sourabh.Sengupta@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3804',name:'Angel Mary Alex',city:'Kottayam',email:'Angel.Mary@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3805',name:'Anoop Karan Tharla',city:'Nizamabad',email:'Anoop.Karan@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3809',name:'Poonam Yadav',city:'Kolkata',email:'Poonam.Yadav@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3811',name:'Ishita Banik',city:'Kolkata',email:'Ishita.Banik@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3813',name:'Sachin Darekar',city:'Ahmednagar',email:'Sachin.Darekar@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3814',name:'Shabib Hyder Mir',city:'Srinagar',email:'Shabib.Hyder@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3815',name:'Abhinav Samant',city:'Gorakhpur',email:'Abhinav.Samant@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'3818',name:'Tanuj Mehta',city:'Agra',email:'Tanuj.Mehta@koenig-solutions.com',desig:'Trainee Trainer'},
  {code:'3821',name:'Harsh Shrivastava',city:'Indore',email:'Harsh.Shrivastava@koenig-solutions.com',desig:'Trainee Trainer'},
  {code:'3823',name:'Abdelrahman Samaha Rashed',city:'Cairo',email:'Abdelrahman.Samaha@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'4005',name:'Mamadou Amadou Kebe',city:'Dakar',email:'Mamadou.Kebe@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'4006',name:'Manoj Kumar Reddy Pusapati',city:'Hyderabad',email:'Manoj.Pusapati@koenig-solutions.com',desig:'Corporate Trainer'},
  {code:'4007',name:'Raja Francis',city:'Coimbatore',email:'Raja.Francis@koenig-solutions.com',desig:'Corporate Trainer'},
];

const CURRENCIES = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal' },
  { code: 'QAR', symbol: 'QR', name: 'Qatari Riyal' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'BHD', symbol: 'BD', name: 'Bahraini Dinar' },
  { code: 'KWD', symbol: 'KD', name: 'Kuwaiti Dinar' },
  { code: 'OMR', symbol: 'OMR', name: 'Omani Rial' },
  { code: 'THB', symbol: '฿', name: 'Thai Baht' },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah' },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
];

function currencySymbol(code: string) {
  return CURRENCIES.find(c => c.code === code)?.symbol ?? code;
}

function uid() { return Math.random().toString(36).slice(2, 8); }

function nightsBetween(a: string, b: string) {
  if (!a || !b) return 0;
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000));
}

function addDay(iso: string, n: number) {
  if (!iso) return '';
  const d = new Date(iso); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function todayISO() { return new Date().toISOString().slice(0, 10); }

// ─── Small shared components ──────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs text-gray-500 mb-1">{children}</label>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label>{label}</Label>{children}</div>;
}

const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-white';
const selectCls = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-white';

function UploadBtn({ label, file, onFile }: { label: string; file: string; onFile: (n: string) => void }) {
  const pick = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.pdf,.jpg,.jpeg,.png';
    inp.onchange = () => { if (inp.files?.[0]) onFile(inp.files[0].name); };
    inp.click();
  };
  return (
    <button type="button" onClick={pick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
        file ? 'bg-green-50 border-green-300 text-green-700' : 'bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100'
      }`}>
      <Upload className="w-3.5 h-3.5" />
      {file ? `✓ ${file.length > 18 ? file.slice(0, 15) + '...' : file}` : label}
    </button>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 pb-2 border-b border-gray-100">{title}</h3>
      {children}
    </div>
  );
}

function InfoTip({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mt-2">
      <Clock className="w-3.5 h-3.5 flex-shrink-0" />{text}
    </div>
  );
}

function CurrencyAmount({
  label, amount, currency,
  onAmount, onCurrency,
}: {
  label: string; amount: number; currency: string;
  onAmount: (v: number) => void; onCurrency: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex gap-1">
        <select
          value={currency}
          onChange={e => onCurrency(e.target.value)}
          className="px-2 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-white w-[90px] flex-shrink-0"
        >
          {CURRENCIES.map(c => (
            <option key={c.code} value={c.code}>{c.code} {c.symbol}</option>
          ))}
        </select>
        <input
          type="number" min={0} placeholder="0"
          value={amount || ''}
          onChange={e => onAmount(parseFloat(e.target.value) || 0)}
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-white min-w-0"
        />
      </div>
    </Field>
  );
}

// ─── Get Trainer Assignment API (api_key=208) ────────────────────────────────

interface Assignment {
  AssignmentId: number | null;
  CourseName: string | null;
  StarDate: string | null;   // "DD-Mon-YYYY" — API typo for StartDate
  EndDate: string | null;
  TotalPax: number | null;
  TrainerName: string | null;
  TrainerEmail: string | null;
  trainer_emp_code: number | null;
  Manager: string | null;
  ManagerEmail: string | null;
}

// "23-Feb-2026" → "2026-02-23"
const MON: Record<string, string> = {
  Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
  Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12',
};
function parseDDMonYYYY(raw: string | null): string {
  if (!raw) return '';
  const p = raw.trim().split('-');
  if (p.length === 3) return `${p[2]}-${MON[p[1]] ?? '01'}-${p[0].padStart(2,'0')}`;
  return raw.slice(0, 10);
}

async function fetchTrainerAssignments(empCode: string): Promise<Assignment[]> {
  const now = new Date();
  const startYear = now.getFullYear();
  const clean = empCode.replace(/^EMP-/i, '').trim();
  const params = new URLSearchParams({
    empCode: clean,
    from: `${startYear}-01-01`,
    to: `${startYear + 1}-12-31`,
  });
  const res = await fetch(`/api/assignments?${params}`);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `Assignments HTTP ${res.status}`);
  const raw: Assignment[] = Array.isArray(data.assignments) ? data.assignments : [];
  return raw.filter(r => r.trainer_emp_code != null && String(r.trainer_emp_code) === String(clean));
}


// ─── Tab 1: Trainer & Assignment ──────────────────────────────────────────────

function Tab1({ d, s }: { d: FormData; s: (x: Partial<FormData>) => void }) {
  const DEPT = 'Training Delivery Inhouse';
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loadingAssign, setLoadingAssign] = useState(false);
  const [assignError, setAssignError] = useState('');
  const lastFetchedCode = useRef('');

  // Fetch assignments when empCode changes
  useEffect(() => {
    const rawCode = d.empCode.replace(/^EMP-/i, '').trim();
    if (!rawCode || rawCode === lastFetchedCode.current) return;
    lastFetchedCode.current = rawCode;
    setAssignments([]);
    setAssignError('');
    setLoadingAssign(true);
    fetchTrainerAssignments(rawCode)
      .then(list => setAssignments(list))
      .catch(err => setAssignError(String(err instanceof Error ? err.message : err)))
      .finally(() => setLoadingAssign(false));
  }, [d.empCode]);

  function selectByName(name: string) {
    const emp = TDI_EMPLOYEES.find(e => e.name === name);
    if (emp) {
      s({ trainerName: emp.name, empCode: `EMP-${emp.code}`, department: DEPT, baseCity: emp.city });
    } else {
      s({ trainerName: name, empCode: '', department: '', baseCity: '' });
    }
  }

  function selectByCode(code: string) {
    const emp = TDI_EMPLOYEES.find(e => `EMP-${e.code}` === code);
    if (emp) {
      s({ trainerName: emp.name, empCode: `EMP-${emp.code}`, department: DEPT, baseCity: emp.city });
    } else {
      s({ empCode: code });
    }
  }

  function applyAssignment(idx: string) {
    if (!idx) return;
    const a = assignments[parseInt(idx)];
    if (!a) return;
    s({
      assignmentId:    a.AssignmentId != null ? String(a.AssignmentId) : '',
      clientName:      a.CourseName ?? '',
      venue:           '',
      city:            '',
      country:         'India',
      assignmentStart: parseDDMonYYYY(a.StarDate),
      assignmentEnd:   parseDDMonYYYY(a.EndDate),
    });
  }

  return (
    <div className="space-y-4">
      <Card title="Trainer details">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Trainer name *">
            {d.trainerName ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm font-medium text-blue-800">
                <CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
                {d.trainerName}
              </div>
            ) : (
              <select className={selectCls} value={d.trainerName} onChange={e => selectByName(e.target.value)}>
                <option value="">— Select trainer —</option>
                {TDI_EMPLOYEES.map(e => (
                  <option key={e.code} value={e.name}>{e.name}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Employee code">
            {d.empCode ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm font-medium text-blue-800">
                <CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
                {d.empCode}
              </div>
            ) : (
              <select className={selectCls} value={d.empCode} onChange={e => selectByCode(e.target.value)}>
                <option value="">— Select emp code —</option>
                {TDI_EMPLOYEES.map(e => (
                  <option key={e.code} value={`EMP-${e.code}`}>EMP-{e.code}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Department">
            {d.department ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm font-medium text-blue-800">
                <CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
                {d.department}
              </div>
            ) : (
              <select className={selectCls} value={d.department} onChange={e => s({ department: e.target.value })}>
                <option value="">— Select department —</option>
                <option value={DEPT}>{DEPT}</option>
              </select>
            )}
          </Field>
          <Field label="Base city">
            <input className={inputCls} value={d.baseCity} placeholder="Auto-filled on trainer select"
              onChange={e => s({ baseCity: e.target.value })} />
          </Field>
        </div>
        {d.trainerName && d.empCode && (
          <p className="mt-2 text-xs text-blue-600 flex items-center gap-1">
            <Info className="w-3 h-3" /> Trainer details auto-filled from your login. Contact HR to update.
          </p>
        )}
      </Card>

      <Card title="Assignment details">
        {/* ── Assignment picker from API ── */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <Label>
              Select assignment from Koenig PMS
              {loadingAssign && (
                <span className="ml-2 inline-flex items-center gap-1 text-blue-500 font-normal text-xs">
                  <Clock className="w-3 h-3 animate-spin" /> Fetching…
                </span>
              )}
            </Label>
            {assignments.length > 0 && (
              <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                {assignments.length} assignment{assignments.length !== 1 ? 's' : ''} found
              </span>
            )}
          </div>

          {/* Error */}
          {assignError && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
              Could not load assignments: {assignError}
            </div>
          )}

          {/* Not yet selected a trainer */}
          {!d.empCode && !loadingAssign && (
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <Info className="w-3 h-3" /> Select a trainer above to load their assignments from PMS.
            </p>
          )}

          {/* Loading skeleton */}
          {loadingAssign && (
            <div className="space-y-2">
              {[1,2,3].map(i => (
                <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          )}

          {/* Assignment table */}
          {!loadingAssign && assignments.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['','Assignment ID','Course Name','Start Date','End Date','Total Pax','Trainer','Manager'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {assignments.map((a, i) => (
                    <tr
                      key={i}
                      className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                      onClick={() => applyAssignment(String(i))}
                    >
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); applyAssignment(String(i)); }}
                          className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-semibold whitespace-nowrap"
                        >
                          Select
                        </button>
                      </td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{a.AssignmentId ?? '—'}</td>
                      <td className="px-3 py-2 font-medium text-gray-800 max-w-[200px]">
                        <div className="truncate" title={a.CourseName ?? ''}>{a.CourseName ?? '—'}</div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-700">{a.StarDate ?? '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-700">{a.EndDate ?? '—'}</td>
                      <td className="px-3 py-2 text-center">
                        {a.TotalPax != null
                          ? <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">{a.TotalPax}</span>
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        <div>{a.TrainerName ?? '—'}</div>
                        {a.TrainerEmail && <div className="text-[10px] text-gray-400">{a.TrainerEmail}</div>}
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        <div>{a.Manager ?? '—'}</div>
                        {a.ManagerEmail && <div className="text-[10px] text-gray-400">{a.ManagerEmail}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Empty after load */}
          {!loadingAssign && d.empCode && assignments.length === 0 && !assignError && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-1">
              <Info className="w-3 h-3 flex-shrink-0" />
              No assignments found in PMS for this trainer in the current/next year — fill details manually below.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Assignment ID">
            <input className={inputCls} value={d.assignmentId} placeholder="e.g. ASN-2026-084"
              onChange={e => s({ assignmentId: e.target.value })} />
          </Field>
          <Field label="Client name *">
            <input className={inputCls} value={d.clientName} placeholder="e.g. Infosys"
              onChange={e => s({ clientName: e.target.value })} />
          </Field>
          <Field label="Training venue / location">
            <input className={inputCls} value={d.venue} placeholder="Venue or address"
              onChange={e => s({ venue: e.target.value })} />
          </Field>
          <Field label="Training city">
            <input className={inputCls} value={d.city} placeholder="e.g. Bangalore"
              onChange={e => s({ city: e.target.value })} />
          </Field>
          <Field label="Country">
            <select className={selectCls} value={d.country} onChange={e => s({ country: e.target.value })}>
              {COUNTRIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Assignment start date *">
            <input type="date" className={inputCls} value={d.assignmentStart} max={todayISO()}
              onChange={e => s({ assignmentStart: e.target.value })} />
          </Field>
          <Field label="Assignment end date *">
            <input type="date" className={inputCls} value={d.assignmentEnd}
              min={d.assignmentStart} max={todayISO()}
              onChange={e => s({ assignmentEnd: e.target.value })} />
          </Field>
        </div>
      </Card>
    </div>
  );
}

// ─── Trainer Flight Details API (api_key=108) ────────────────────────────────

interface FlightRecord {
  trip_ID: number | null;
  flight_number: string | null;
  from_city: string | null;
  to_city: string | null;
  departure_date: string | null;   // "2018-02-04T00:00:00"
  departure_time: string | null;   // "16:00:00"
  arrival_date: string | null;
  arrival_time: string | null;
  connecting_flight_id: number | null;
  Is_cancelled: string | null;     // "Yes" | "No"
  ticket_path: string | null;
  insurance_path: string | null;
  airlines_name: string | null;
}

async function fetchTrainerFlights(email: string): Promise<FlightRecord[]> {
  const res = await fetch(`/api/flights?email=${encodeURIComponent(email.trim())}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Flights HTTP ${res.status}`);
  const raw: FlightRecord[] = Array.isArray(data.flights) ? data.flights : [];
  return raw;
}

// "2018-02-04T00:00:00" → "2018-02-04"
function parseDT(dt: string | null): string {
  if (!dt) return '';
  return dt.slice(0, 10);
}

// "16:00:00" → "16:00"
function parseTM(t: string | null): string {
  if (!t) return '';
  return t.slice(0, 5);
}

// ─── Tab 2: Travel Details ────────────────────────────────────────────────────

function Tab2({ d, s, trainerEmail }: { d: FormData; s: (x: Partial<FormData>) => void; trainerEmail: string }) {
  const minDate = d.assignmentStart ? addDay(d.assignmentStart, -1) : '';
  const maxDate = d.assignmentEnd || todayISO();

  // ── Flight API state ──────────────────────────────────────────────────────
  const [flights, setFlights] = useState<FlightRecord[]>([]);
  const [flightsLoading, setFlightsLoading] = useState(false);
  const [flightsError, setFlightsError] = useState('');
  const fetchedEmailRef = useRef('');

  useEffect(() => {
    const email = trainerEmail.trim();
    if (!email || email === fetchedEmailRef.current) return;
    fetchedEmailRef.current = email;
    setFlightsLoading(true);
    setFlightsError('');
    fetchTrainerFlights(email)
      .then(list => setFlights(list))
      .catch(err => setFlightsError(err instanceof Error ? err.message : String(err)))
      .finally(() => setFlightsLoading(false));
  }, [trainerEmail]);

  function addFlightAsLeg(f: FlightRecord) {
    const newLeg: TravelLeg = {
      id: uid(),
      mode: 'Flight',
      from: f.from_city ?? '',
      to: f.to_city ?? '',
      departureDate: parseDT(f.departure_date),
      arrivalDate: parseDT(f.arrival_date),
      fare: 0,
      currency: 'INR',
      pnr: f.flight_number ?? '',
      receipt: f.ticket_path ?? '',
    };
    s({ travelLegs: [...d.travelLegs, newLeg] });
  }

  const addLeg = () => s({ travelLegs: [...d.travelLegs, {
    id: uid(), mode: 'Flight', from: d.baseCity, to: d.city,
    departureDate: d.claimFrom || minDate, arrivalDate: d.claimFrom || minDate,
    fare: 0, currency: 'INR', pnr: '', receipt: '',
  }]});

  const updateLeg = (id: string, patch: Partial<TravelLeg>) =>
    s({ travelLegs: d.travelLegs.map(l => l.id === id ? { ...l, ...patch } : l) });

  const removeLeg = (id: string) =>
    s({ travelLegs: d.travelLegs.filter(l => l.id !== id) });

  const addCab = () => s({ cabEntries: [...d.cabEntries, {
    id: uid(), date: d.claimFrom || minDate, from: '', to: '', amount: 0, currency: 'INR', receipt: '',
  }]});

  const updateCab = (id: string, patch: Partial<CabEntry>) =>
    s({ cabEntries: d.cabEntries.map(c => c.id === id ? { ...c, ...patch } : c) });

  const removeCab = (id: string) =>
    s({ cabEntries: d.cabEntries.filter(c => c.id !== id) });

  const ModeIcon = ({ mode }: { mode: string }) => {
    if (mode === 'Flight') return <Plane className="w-3.5 h-3.5" />;
    if (mode === 'Train') return <Train className="w-3.5 h-3.5" />;
    if (mode === 'Bus') return <Bus className="w-3.5 h-3.5" />;
    return <Car className="w-3.5 h-3.5" />;
  };

  return (
    <div className="space-y-4">
      {/* Claim period */}
      <Card title="Claim period">
        <div className="grid grid-cols-2 gap-3">
          <Field label="From — earliest: 1 day before assignment">
            <input type="date" className={inputCls} value={d.claimFrom}
              min={minDate} max={maxDate}
              onChange={e => s({ claimFrom: e.target.value })} />
          </Field>
          <Field label="To">
            <input type="date" className={inputCls} value={d.claimTo}
              min={d.claimFrom || minDate} max={maxDate}
              onChange={e => s({ claimTo: e.target.value })} />
          </Field>
        </div>
        {minDate && (
          <InfoTip text={`You can claim from ${formatDate(minDate)} (1 day before assignment start). Future dates are greyed out.`} />
        )}
      </Card>

      {/* Travel legs */}
      <Card title="Travel legs">

        {/* ── Flight records from Koenig PMS ── */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
              <Plane className="w-3.5 h-3.5 text-blue-500" />
              Booked flights from Koenig PMS
              {flightsLoading && (
                <span className="ml-1 text-blue-500 font-normal flex items-center gap-1">
                  <Clock className="w-3 h-3 animate-spin" /> Fetching…
                </span>
              )}
            </span>
            {flights.length > 0 && (
              <span className="text-xs bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
                {flights.length} flight record{flights.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {flightsError && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2">
              Could not load flights: {flightsError}
            </div>
          )}

          {!trainerEmail && !flightsLoading && (
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <Info className="w-3 h-3" /> Login as a trainer to auto-load your booked flights.
            </p>
          )}

          {flightsLoading && (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-7 bg-gray-100 rounded animate-pulse" />)}
            </div>
          )}

          {!flightsLoading && flights.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['', 'Trip ID', 'Flight No.', 'Airline', 'From', 'To', 'Departure', 'Arrival', 'Status', 'Ticket'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {flights.map((f, i) => {
                    const cancelled = f.Is_cancelled === 'Yes';
                    return (
                      <tr key={i} className={cancelled ? 'opacity-50 bg-gray-50' : 'hover:bg-blue-50/30'}>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            disabled={cancelled}
                            onClick={() => addFlightAsLeg(f)}
                            className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[10px] font-semibold whitespace-nowrap"
                          >
                            + Add Leg
                          </button>
                        </td>
                        <td className="px-3 py-2 text-gray-500">{f.trip_ID ?? '—'}</td>
                        <td className="px-3 py-2 font-medium text-gray-800">{f.flight_number ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-700 max-w-[120px]">
                          <div className="truncate">{f.airlines_name?.trim() ?? '—'}</div>
                        </td>
                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{f.from_city ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{f.to_city ?? '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                          {parseDT(f.departure_date)
                            ? <><span>{parseDT(f.departure_date)}</span> <span className="text-gray-400">{parseTM(f.departure_time)}</span></>
                            : '—'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                          {parseDT(f.arrival_date)
                            ? <><span>{parseDT(f.arrival_date)}</span> <span className="text-gray-400">{parseTM(f.arrival_time)}</span></>
                            : '—'}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${cancelled ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
                            {cancelled ? 'Cancelled' : 'Active'}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {f.ticket_path
                            ? <a href={f.ticket_path} target="_blank" rel="noreferrer"
                                className="text-blue-600 hover:underline flex items-center gap-1 text-[10px]">
                                <Upload className="w-3 h-3" /> View
                              </a>
                            : <span className="text-gray-400">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!flightsLoading && trainerEmail && flights.length === 0 && !flightsError && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-1">
              <Info className="w-3 h-3 flex-shrink-0" /> No flight records found in PMS for this trainer — add legs manually below.
            </p>
          )}

          <div className="mt-2 border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-600 mb-0.5">Manually added / confirmed travel legs</p>
            <p className="text-xs text-gray-400">Click <strong>+ Add Leg</strong> on a flight above to import it, or use the button below to add manually.</p>
          </div>
        </div>

        <div className="space-y-3">
          {d.travelLegs.map((leg, i) => (
            <div key={leg.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                  <ModeIcon mode={leg.mode} /> Leg {i + 1}
                </div>
                <div className="flex items-center gap-2">
                  <UploadBtn label="Upload ticket / receipt" file={leg.receipt}
                    onFile={n => updateLeg(leg.id, { receipt: n })} />
                  <button type="button" onClick={() => removeLeg(leg.id)}
                    className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Mode">
                  <select className={selectCls} value={leg.mode}
                    onChange={e => updateLeg(leg.id, { mode: e.target.value })}>
                    {MODES.map(m => <option key={m}>{m}</option>)}
                  </select>
                </Field>
                <Field label="From">
                  <input className={inputCls} value={leg.from} placeholder="City / Airport"
                    onChange={e => updateLeg(leg.id, { from: e.target.value })} />
                </Field>
                <Field label="To">
                  <input className={inputCls} value={leg.to} placeholder="City / Airport"
                    onChange={e => updateLeg(leg.id, { to: e.target.value })} />
                </Field>
                <Field label="Departure date">
                  <input type="date" className={inputCls} value={leg.departureDate}
                    min={minDate} max={maxDate}
                    onChange={e => updateLeg(leg.id, { departureDate: e.target.value })} />
                </Field>
                <Field label="Arrival date">
                  <input type="date" className={inputCls} value={leg.arrivalDate}
                    min={leg.departureDate || minDate} max={addDay(maxDate, 1)}
                    onChange={e => updateLeg(leg.id, { arrivalDate: e.target.value })} />
                </Field>
                <CurrencyAmount
                  label="Fare"
                  amount={leg.fare} currency={leg.currency}
                  onAmount={v => updateLeg(leg.id, { fare: v })}
                  onCurrency={v => updateLeg(leg.id, { currency: v })}
                />
                {(leg.mode === 'Flight' || leg.mode === 'Train') && (
                  <Field label="PNR / Ticket no.">
                    <input className={inputCls} value={leg.pnr} placeholder="Optional"
                      onChange={e => updateLeg(leg.id, { pnr: e.target.value })} />
                  </Field>
                )}
              </div>
            </div>
          ))}
          <button type="button" onClick={addLeg}
            className="w-full py-2.5 border-2 border-dashed border-blue-300 rounded-lg text-sm text-blue-600 hover:bg-blue-50 flex items-center justify-center gap-2 transition-colors">
            <Plus className="w-4 h-4" /> Add travel leg
          </button>
        </div>
      </Card>

      {/* Cab entries */}
      <Card title="Local cab / conveyance">
        <div className="space-y-2">
          {d.cabEntries.map(cab => {
            const routePreset = CAB_ROUTES.find(r => r !== 'Custom' && cab.from && cab.to && r === `${cab.from} → ${cab.to}`) ?? 'Custom';
            const applyPreset = (preset: string) => {
              if (preset === 'Custom') return;
              const [f, t] = preset.split(' → ');
              updateCab(cab.id, { from: f, to: t });
            };
            return (
            <div key={cab.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                <Field label="Date">
                  <input type="date" className={inputCls} value={cab.date}
                    min={minDate} max={maxDate}
                    onChange={e => updateCab(cab.id, { date: e.target.value })} />
                </Field>
                <Field label="Route (quick-fill)">
                  <select className={selectCls} value={routePreset}
                    onChange={e => applyPreset(e.target.value)}>
                    {CAB_ROUTES.map(r => <option key={r}>{r}</option>)}
                  </select>
                </Field>
                <Field label="From">
                  <input className={inputCls} value={cab.from} placeholder="Pickup point"
                    onChange={e => updateCab(cab.id, { from: e.target.value })} />
                </Field>
                <Field label="To">
                  <input className={inputCls} value={cab.to} placeholder="Drop point"
                    onChange={e => updateCab(cab.id, { to: e.target.value })} />
                </Field>
                <CurrencyAmount
                  label="Amount"
                  amount={cab.amount} currency={cab.currency}
                  onAmount={v => updateCab(cab.id, { amount: v })}
                  onCurrency={v => updateCab(cab.id, { currency: v })}
                />
              </div>
              <div className="flex items-center gap-2 mt-2">
                <UploadBtn label="Upload receipt" file={cab.receipt}
                  onFile={n => updateCab(cab.id, { receipt: n })} />
                <button type="button" onClick={() => removeCab(cab.id)}
                  className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            );
          })}
          <button type="button" onClick={addCab}
            className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:bg-gray-50 flex items-center justify-center gap-2 transition-colors">
            <Plus className="w-4 h-4" /> Add cab entry
          </button>
        </div>
      </Card>
    </div>
  );
}

// ─── Employee Leave API ───────────────────────────────────────────────────────

interface LeaveRecord {
  emp_name?: string;
  emp_code?: string;
  from_date?: string;
  from_time?: string;
  to_date?: string;
  to_time?: string;
  leave_status?: string;
  leave_approval_date?: string;
  leave_type?: string;
}

async function fetchEmployeeLeaves(empCode: string): Promise<LeaveRecord[]> {
  const clean = empCode.replace(/^EMP-/i, '').trim();
  const res = await fetch(`/api/leaves?empCode=${encodeURIComponent(clean)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Leaves HTTP ${res.status}`);
  const leaves: LeaveRecord[] = Array.isArray(data.leaves) ? data.leaves : [];
  return leaves.filter(r => r.from_date);
}

// ─── Trainer Accommodation API (api_key=120) ──────────────────────────────────

interface AccommodationRecord {
  EmpId: number | null;
  TrainerName: string | null;
  RoomNo: string | null;
  AccommodationName: string | null;
  CityName: string | null;
  CheckInDate: string | null;   // ISO datetime e.g. "2026-07-04T00:00:00"
  CheckOutDate: string | null;
  Nights: number | null;
  StayDates: string | null;
  AccommodationPDF: string | null;
}

async function fetchTrainerAccommodation(email: string): Promise<AccommodationRecord[]> {
  const res = await fetch(`/api/accommodation?email=${encodeURIComponent(email.trim())}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Accommodation HTTP ${res.status}`);
  return Array.isArray(data.accommodation) ? data.accommodation : [];
}

function accomDT(dt: string | null): string {
  return dt ? dt.slice(0, 10) : '';
}

// Expand a leave record's date range into individual YYYY-MM-DD strings
function expandLeaveDates(from: string, to: string): string[] {
  const dates: string[] = [];
  const start = new Date(from.slice(0, 10));
  const end = new Date((to || from).slice(0, 10));
  const cur = new Date(start);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// ─── Tab 3: DA & Lodging ──────────────────────────────────────────────────────

function Tab3({ d, s, trainerEmail }: { d: FormData; s: (x: Partial<FormData>) => void; trainerEmail: string }) {
  const minDate = d.assignmentStart ? addDay(d.assignmentStart, -1) : '';
  const maxDate = d.assignmentEnd || todayISO();

  // Accommodation API state
  const [accomRecords, setAccomRecords] = useState<AccommodationRecord[]>([]);
  const [loadingAccom, setLoadingAccom] = useState(false);
  const [accomError, setAccomError] = useState('');
  const [importedAccom, setImportedAccom] = useState<Set<string>>(new Set());
  const lastAccomEmail = useRef('');

  useEffect(() => {
    if (!trainerEmail || trainerEmail === lastAccomEmail.current) return;
    lastAccomEmail.current = trainerEmail;
    setAccomRecords([]);
    setAccomError('');
    setLoadingAccom(true);
    fetchTrainerAccommodation(trainerEmail)
      .then(records => {
        // Filter to records overlapping with the claim period
        const claimFrom = d.claimFrom || d.assignmentStart || '';
        const claimTo = d.claimTo || d.assignmentEnd || '';
        const filtered = records.filter(r => {
          const ci = accomDT(r.CheckInDate);
          const co = accomDT(r.CheckOutDate);
          if (!ci) return false;
          if (!claimFrom && !claimTo) return true;
          // overlaps if checkIn <= claimTo AND checkOut >= claimFrom
          const toCheck = co || ci;
          return (!claimTo || ci <= claimTo) && (!claimFrom || toCheck >= claimFrom);
        });
        filtered.sort((a, b) => accomDT(a.CheckInDate).localeCompare(accomDT(b.CheckInDate)));
        setAccomRecords(filtered);
      })
      .catch(err => {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.toLowerCase().includes('forbidden') && !msg.toLowerCase().includes('permission')) {
          setAccomError(msg);
        }
      })
      .finally(() => setLoadingAccom(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainerEmail]);

  function importAccomAsStay(r: AccommodationRecord) {
    const key = `${r.AccommodationName}-${accomDT(r.CheckInDate)}`;
    if (importedAccom.has(key)) return;
    const stay: HotelStay = {
      id: uid(),
      hotelName: [r.AccommodationName, r.CityName].filter(Boolean).join(', ') || '',
      checkIn: accomDT(r.CheckInDate),
      checkOut: accomDT(r.CheckOutDate),
      ratePerNight: 0,
      currency: 'INR',
      stayType: 'Company Provided',
      receipt: r.AccommodationPDF ?? '',
    };
    s({ hotelStays: [...d.hotelStays, stay] });
    setImportedAccom(prev => new Set([...prev, key]));
  }

  // Leave API state
  const [leaveRecords, setLeaveRecords] = useState<LeaveRecord[]>([]);
  const [loadingLeaves, setLoadingLeaves] = useState(false);
  const [leaveError, setLeaveError] = useState('');
  const lastLeaveFetch = useRef('');

  useEffect(() => {
    const rawCode = d.empCode.replace(/^EMP-/i, '');
    if (!rawCode || rawCode === lastLeaveFetch.current) return;
    lastLeaveFetch.current = rawCode;
    setLeaveRecords([]);
    setLeaveError('');
    setLoadingLeaves(true);
    fetchEmployeeLeaves(rawCode)
      .then(records => setLeaveRecords(records))
      .catch(err => setLeaveError(String(err.message || err)))
      .finally(() => setLoadingLeaves(false));
  }, [d.empCode]);

  // Toggle a leave record's dates into/out of leaveDates string
  function toggleLeaveRecord(record: LeaveRecord, checked: boolean) {
    const dates = expandLeaveDates(record.from_date!, record.to_date || record.from_date!);
    const existing = new Set(d.leaveDates.split(',').map(x => x.trim()).filter(Boolean));
    if (checked) {
      dates.forEach(dt => existing.add(dt));
    } else {
      dates.forEach(dt => existing.delete(dt));
    }
    s({ leaveDates: Array.from(existing).sort().join(', ') });
  }

  function isLeaveChecked(record: LeaveRecord): boolean {
    const existing = new Set(d.leaveDates.split(',').map(x => x.trim()).filter(Boolean));
    const dates = expandLeaveDates(record.from_date!, record.to_date || record.from_date!);
    return dates.every(dt => existing.has(dt));
  }

  // Build DA rows from travel dates
  const daRows = useMemo(() => {
    if (!d.claimFrom || !d.claimTo) return [];
    const rows: { date: string; type: string; amount: number }[] = [];
    const leaveDays = new Set(d.leaveDates.split(',').map(s => s.trim()).filter(Boolean));
    const staybackDays = new Set(d.staybackDates.split(',').map(s => s.trim()).filter(Boolean));
    const start = new Date(d.claimFrom);
    const end = new Date(d.claimTo);
    const cur = new Date(start);
    const RATE = 1000;
    while (cur <= end) {
      const iso = cur.toISOString().slice(0, 10);
      const isLeave = leaveDays.has(iso);
      const isStayback = staybackDays.has(iso);
      const isFirst = iso === d.claimFrom;
      const isLast = iso === d.claimTo;
      let type = 'Full day';
      let amount = RATE;
      if (isLeave) { type = 'Leave'; amount = 0; }
      else if (isStayback) { type = 'Stayback'; amount = 0; }
      else if (isFirst || isLast) { type = 'Half day'; amount = RATE / 2; }
      rows.push({ date: iso, type, amount });
      cur.setDate(cur.getDate() + 1);
    }
    return rows;
  }, [d.claimFrom, d.claimTo, d.leaveDates, d.staybackDates]);

  const totalDA = daRows.reduce((sum, r) => sum + r.amount, 0);

  const addHotel = () => s({ hotelStays: [...d.hotelStays, {
    id: uid(), hotelName: '', checkIn: d.assignmentStart || '',
    checkOut: d.assignmentEnd || '', ratePerNight: 0, currency: 'INR', stayType: 'Self Booked', receipt: '',
  }]});

  const updateHotel = (id: string, patch: Partial<HotelStay>) =>
    s({ hotelStays: d.hotelStays.map(h => h.id === id ? { ...h, ...patch } : h) });

  const removeHotel = (id: string) =>
    s({ hotelStays: d.hotelStays.filter(h => h.id !== id) });

  const addExp = () => s({ otherExpenses: [...d.otherExpenses, {
    id: uid(), category: 'Meal', description: '', date: d.assignmentStart || '', amount: 0, currency: 'INR', receipt: '',
  }]});

  const updateExp = (id: string, patch: Partial<OtherExpense>) =>
    s({ otherExpenses: d.otherExpenses.map(e => e.id === id ? { ...e, ...patch } : e) });

  const removeExp = (id: string) =>
    s({ otherExpenses: d.otherExpenses.filter(e => e.id !== id) });

  return (
    <div className="space-y-4">
      {/* DA table */}
      <Card title="Daily allowance — auto-calculated from claim period">
        {daRows.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">
            Set the claim period in the Travel tab — DA will appear here automatically.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-gray-200 mb-3">
              <table className="min-w-full text-xs divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {['Date', 'Day type', 'DA eligible'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-gray-500 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {daRows.map(r => (
                    <tr key={r.date} className={r.amount === 0 ? 'opacity-40' : ''}>
                      <td className="px-3 py-2 font-medium">{formatDate(r.date)}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.type === 'Full day' ? 'bg-green-100 text-green-700' :
                          r.type === 'Half day' ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>{r.type}</span>
                      </td>
                      <td className="px-3 py-2 font-semibold text-green-700">₹{r.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end text-sm font-semibold text-gray-700">
              Total DA: <span className="text-green-700 ml-2">{formatINR(totalDA)}</span>
            </div>
          </>
        )}
        <div className="mt-4 space-y-3">
          {/* Leave picker from HR API */}
          <div>
            <Label>
              Leave dates from HR records
              {loadingLeaves && <span className="ml-2 text-blue-500 font-normal">Fetching from Koenig PMS…</span>}
            </Label>
            {!d.empCode && (
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                <Info className="w-3 h-3" /> Select a trainer in Tab 1 to load their leave records.
              </p>
            )}
            {leaveError && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                Could not load leave records: {leaveError}
              </div>
            )}
            {d.empCode && !loadingLeaves && !leaveError && leaveRecords.length === 0 && (
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                <Info className="w-3 h-3" /> No leave records found for this employee — enter dates manually below.
              </p>
            )}
            {leaveRecords.length > 0 && (
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 mt-1 max-h-56 overflow-y-auto">
                {leaveRecords.map((rec, i) => {
                  const from = rec.from_date?.slice(0, 10) || '';
                  const to = rec.to_date?.slice(0, 10) || from;
                  const dateLabel = from === to ? formatDate(from) : `${formatDate(from)} → ${formatDate(to)}`;
                  const checked = isLeaveChecked(rec);
                  return (
                    <label key={i} className={`flex items-start gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 ${checked ? 'bg-red-50' : ''}`}>
                      <input
                        type="checkbox"
                        className="mt-0.5 accent-red-500"
                        checked={checked}
                        onChange={e => toggleLeaveRecord(rec, e.target.checked)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-gray-700">{dateLabel}</div>
                        <div className="text-xs text-gray-400 flex gap-2 flex-wrap">
                          {rec.leave_type && <span>{rec.leave_type}</span>}
                          {rec.leave_status && (
                            <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
                              rec.leave_status.toLowerCase().includes('approv') ? 'bg-green-100 text-green-700' :
                              rec.leave_status.toLowerCase().includes('reject') ? 'bg-red-100 text-red-700' :
                              'bg-amber-100 text-amber-700'
                            }`}>{rec.leave_status}</span>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Leave dates (auto-filled or manual, comma separated)">
              <input className={inputCls} value={d.leaveDates} placeholder="e.g. 2026-05-29"
                onChange={e => s({ leaveDates: e.target.value })} />
            </Field>
            <Field label="Personal stayback dates">
              <input className={inputCls} value={d.staybackDates} placeholder="e.g. 2026-06-04"
                onChange={e => s({ staybackDates: e.target.value })} />
            </Field>
          </div>
        </div>
      </Card>

      {/* Hotel stays */}
      <Card title="Lodging / hotel stays">

        {/* ── PMS Accommodation Panel ─────────────────────────────────── */}
        {loadingAccom && (
          <div className="flex items-center gap-2 mb-4 text-sm text-blue-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            Fetching accommodation records from PMS…
          </div>
        )}
        {accomError && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {accomError}
          </div>
        )}
        {!loadingAccom && !accomError && accomRecords.length > 0 && (
          <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-blue-100 border-b border-blue-200">
              <div className="flex items-center gap-2 text-blue-800 text-xs font-semibold">
                <Hotel className="w-3.5 h-3.5" />
                Booked Accommodation from PMS ({accomRecords.length} record{accomRecords.length !== 1 ? 's' : ''})
              </div>
              <span className="text-[10px] text-blue-600">Click &quot;+ Import&quot; to add as a hotel stay</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-blue-200">
                    {['Accommodation', 'City', 'Room No', 'Check-In', 'Check-Out', 'Nights', 'PDF', 'Action'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-blue-700 font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-100">
                  {accomRecords.map((r, idx) => {
                    const key = `${r.AccommodationName}-${accomDT(r.CheckInDate)}`;
                    const imported = importedAccom.has(key);
                    return (
                      <tr key={idx} className={imported ? 'opacity-50 bg-blue-50' : 'hover:bg-white'}>
                        <td className="px-3 py-2.5 font-medium text-gray-800 max-w-[180px]">
                          <div className="truncate" title={r.AccommodationName ?? ''}>{r.AccommodationName ?? '—'}</div>
                          {r.TrainerName && <div className="text-[10px] text-gray-400">{r.TrainerName}</div>}
                        </td>
                        <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{r.CityName ?? '—'}</td>
                        <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{r.RoomNo ?? '—'}</td>
                        <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                          {accomDT(r.CheckInDate) ? formatDate(accomDT(r.CheckInDate)) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                          {accomDT(r.CheckOutDate) ? formatDate(accomDT(r.CheckOutDate)) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {r.Nights != null
                            ? <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">{r.Nights}</span>
                            : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          {r.AccommodationPDF
                            ? <a href={r.AccommodationPDF} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1 text-blue-600 hover:underline text-[11px]">
                                <ExternalLink className="w-3 h-3" /> View
                              </a>
                            : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {imported
                            ? <span className="flex items-center gap-1 text-green-600 text-[11px] font-medium">
                                <CheckCircle className="w-3 h-3" /> Imported
                              </span>
                            : <button
                                type="button"
                                onClick={() => importAccomAsStay(r)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold transition-colors"
                              >
                                <Plus className="w-3 h-3" /> Import
                              </button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {!loadingAccom && !accomError && accomRecords.length === 0 && trainerEmail && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500">
            <Hotel className="w-4 h-4 text-gray-400 flex-shrink-0" />
            No PMS accommodation records found for this trainer. Add hotel stays manually below.
          </div>
        )}

        <div className="space-y-3">
          {d.hotelStays.map(h => (
            <div key={h.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-600">Hotel stay</span>
                <div className="flex items-center gap-2">
                  <UploadBtn label="Upload hotel invoice" file={h.receipt}
                    onFile={n => updateHotel(h.id, { receipt: n })} />
                  <button type="button" onClick={() => removeHotel(h.id)}
                    className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div className="col-span-2 sm:col-span-1">
                  <Field label="Hotel name">
                    <input className={inputCls} value={h.hotelName} placeholder="Hotel / guest house"
                      onChange={e => updateHotel(h.id, { hotelName: e.target.value })} />
                  </Field>
                </div>
                <Field label="Check-in">
                  <input type="date" className={inputCls} value={h.checkIn}
                    min={minDate} max={maxDate}
                    onChange={e => updateHotel(h.id, { checkIn: e.target.value })} />
                </Field>
                <Field label="Check-out">
                  <input type="date" className={inputCls} value={h.checkOut}
                    min={h.checkIn || minDate} max={maxDate}
                    onChange={e => updateHotel(h.id, { checkOut: e.target.value })} />
                </Field>
                <CurrencyAmount
                  label="Rate / night"
                  amount={h.ratePerNight} currency={h.currency}
                  onAmount={v => updateHotel(h.id, { ratePerNight: v })}
                  onCurrency={v => updateHotel(h.id, { currency: v })}
                />
                <Field label="Stay type">
                  <select className={selectCls} value={h.stayType}
                    onChange={e => updateHotel(h.id, { stayType: e.target.value })}>
                    {STAY_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </Field>
                <div className="flex items-end">
                  <div className="w-full px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 font-semibold">
                    {currencySymbol(h.currency)}{(nightsBetween(h.checkIn, h.checkOut) * h.ratePerNight).toLocaleString()}
                    <span className="text-xs text-green-500 font-normal ml-1">
                      ({nightsBetween(h.checkIn, h.checkOut)} nights)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          <button type="button" onClick={addHotel}
            className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:bg-gray-50 flex items-center justify-center gap-2 transition-colors">
            <Plus className="w-4 h-4" /> Add hotel stay
          </button>
        </div>
      </Card>

      {/* Other expenses */}
      <Card title="Other expenses (meals, visa, misc)">
        <div className="space-y-2">
          {d.otherExpenses.map(exp => (
            <div key={exp.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                <Field label="Category">
                  <select className={selectCls} value={exp.category}
                    onChange={e => updateExp(exp.id, { category: e.target.value })}>
                    {EXP_CATS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Description">
                  <input className={inputCls} value={exp.description} placeholder="Brief note"
                    onChange={e => updateExp(exp.id, { description: e.target.value })} />
                </Field>
                <Field label="Date">
                  <input type="date" className={inputCls} value={exp.date}
                    min={minDate} max={maxDate}
                    onChange={e => updateExp(exp.id, { date: e.target.value })} />
                </Field>
                <CurrencyAmount
                  label="Amount"
                  amount={exp.amount} currency={exp.currency}
                  onAmount={v => updateExp(exp.id, { amount: v })}
                  onCurrency={v => updateExp(exp.id, { currency: v })}
                />
              </div>
              <div className="flex items-center gap-2 mt-2">
                <UploadBtn label="Upload receipt" file={exp.receipt}
                  onFile={n => updateExp(exp.id, { receipt: n })} />
                <button type="button" onClick={() => removeExp(exp.id)}
                  className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
          <button type="button" onClick={addExp}
            className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:bg-gray-50 flex items-center justify-center gap-2 transition-colors">
            <Plus className="w-4 h-4" /> Add other expense
          </button>
        </div>
      </Card>
    </div>
  );
}

// ─── Tab 4: Advance & Summary ─────────────────────────────────────────────────

function Tab4({ d, s, totals }: { d: FormData; s: (x: Partial<FormData>) => void; totals: ReturnType<typeof calcTotals> }) {
  const toggleAdv = (id: string) =>
    s({ advances: d.advances.map(a => a.id === id ? { ...a, selected: !a.selected } : a) });

  return (
    <div className="space-y-4">
      <Card title="Expense summary">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Travel fare', val: totals.travel },
            { label: 'Cab / conveyance', val: totals.cab },
            { label: 'Daily allowance', val: totals.da },
            { label: 'Lodging', val: totals.lodging },
            { label: 'Other expenses', val: totals.other },
          ].map(({ label, val }) => (
            <div key={label} className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-sm font-semibold text-gray-800 mt-0.5">{formatINR(val)}</p>
            </div>
          ))}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-600">Total claimed</p>
            <p className="text-sm font-bold text-blue-700 mt-0.5">{formatINR(totals.total)}</p>
          </div>
        </div>
      </Card>

      <Card title="Advance adjustment">
        <div className="space-y-2">
          {d.advances.map(adv => (
            <label key={adv.id}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                adv.selected ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
              }`}>
              <input type="checkbox" checked={adv.selected} onChange={() => toggleAdv(adv.id)}
                className="w-4 h-4 accent-blue-600" />
              <span className="flex-1 text-sm text-gray-700">{adv.label}</span>
              <span className="text-sm font-semibold text-red-600">-{formatINR(adv.amount)}</span>
            </label>
          ))}
        </div>
      </Card>

      <div className="rounded-xl p-4 border border-blue-200 bg-blue-50 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-blue-600">Total claimed</p>
          <p className="text-xl font-bold text-blue-700">{formatINR(totals.total)}</p>
        </div>
        {totals.advance > 0 && (
          <div className="text-center">
            <p className="text-xs text-blue-600">Advance adjusted</p>
            <p className="text-base font-semibold text-red-600">-{formatINR(totals.advance)}</p>
          </div>
        )}
        <div className="text-right">
          <p className="text-xs text-blue-600">Net payable</p>
          <p className="text-xl font-bold text-blue-900">{formatINR(totals.net)}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Tab 5: Preview & Submit ──────────────────────────────────────────────────

function Tab5({ d, s, totals, onSubmit, submitting }: {
  d: FormData; s: (x: Partial<FormData>) => void;
  totals: ReturnType<typeof calcTotals>;
  onSubmit: () => void; submitting: boolean;
}) {
  const receipts = [
    ...d.travelLegs.map(l => l.receipt),
    ...d.cabEntries.map(c => c.receipt),
    ...d.hotelStays.map(h => h.receipt),
    ...d.otherExpenses.map(e => e.receipt),
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <Card title="Trainer & assignment">
        <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
          {[
            ['Assignment ID', d.assignmentId || '—'],
            ['Trainer', d.trainerName || '—'],
            ['Emp code', d.empCode || '—'],
            ['Department', d.department || '—'],
            ['Client', d.clientName || '—'],
            ['Venue', d.venue || '—'],
            ['City', `${d.city}${d.country ? ', ' + d.country : ''}`],
            ['Training dates', d.assignmentStart ? `${formatDate(d.assignmentStart)} – ${formatDate(d.assignmentEnd)}` : '—'],
            ['Claim period', d.claimFrom ? `${formatDate(d.claimFrom)} – ${formatDate(d.claimTo)}` : '—'],
            ...(d.remarks ? [['Remarks', d.remarks]] : []),
          ].map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="text-gray-400 text-xs min-w-[90px] pt-0.5">{k}</span>
              <span className="text-gray-800 font-medium text-xs">{v}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Financial summary">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            {[
              ['Travel fare', totals.travel],
              ['Cab / conveyance', totals.cab],
              ['Daily allowance', totals.da],
              ['Lodging', totals.lodging],
              ['Other expenses', totals.other],
            ].map(([label, val]) => (
              <tr key={label as string}>
                <td className="py-2 text-gray-500">{label}</td>
                <td className="py-2 text-right font-medium text-gray-800">{formatINR(val as number)}</td>
              </tr>
            ))}
            <tr><td className="py-2 font-semibold text-gray-700">Total claimed</td>
              <td className="py-2 text-right font-semibold text-gray-900">{formatINR(totals.total)}</td></tr>
            {totals.advance > 0 && (
              <tr><td className="py-2 text-gray-500">Advance adjusted</td>
                <td className="py-2 text-right text-red-600 font-medium">-{formatINR(totals.advance)}</td></tr>
            )}
            <tr className="border-t-2 border-gray-300">
              <td className="pt-3 pb-2 font-bold text-gray-800 text-base">Net payable</td>
              <td className="pt-3 pb-2 text-right font-bold text-blue-700 text-base">{formatINR(totals.net)}</td>
            </tr>
          </tbody>
        </table>
      </Card>

      <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-4 py-2.5 border border-gray-200">
        <Upload className="w-4 h-4 text-blue-500" />
        <span>{receipts.length} receipt(s) attached</span>
        {receipts.length === 0 && <span className="text-amber-600 text-xs ml-1">— Upload receipts in Travel / DA tabs</span>}
      </div>

      <Card title="Remarks / additional notes">
        <Field label="Remarks (optional — visible to HR/Admin reviewer)">
          <textarea
            className={`${inputCls} resize-none`}
            rows={3}
            value={d.remarks}
            placeholder="Any special circumstances, explanations, or notes for the reviewer…"
            onChange={e => s({ remarks: e.target.value })}
          />
        </Field>
      </Card>

      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" checked={d.declared} onChange={e => s({ declared: e.target.checked })}
          className="mt-0.5 w-4 h-4 accent-blue-600" />
        <span className="text-sm text-gray-700">
          I declare that all information furnished above is true and correct to the best of my knowledge.
          All expenses are genuine and supported by receipts wherever applicable.
        </span>
      </label>

      <button type="button" disabled={!d.declared || submitting} onClick={onSubmit}
        className="w-full py-3 rounded-xl font-semibold text-white text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors">
        {submitting
          ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Submitting...</>
          : <><CheckCircle className="w-4 h-4" />Submit TA/DA claim</>}
      </button>
    </div>
  );
}

// ─── Totals helper ────────────────────────────────────────────────────────────

function calcTotals(d: FormData) {
  const travel = d.travelLegs.reduce((s, l) => s + l.fare, 0);
  const cab = d.cabEntries.reduce((s, c) => s + c.amount, 0);
  const da = (() => {
    if (!d.claimFrom || !d.claimTo) return 0;
    let total = 0;
    const RATE = 1000;
    const leaveDays = new Set(d.leaveDates.split(',').map(s => s.trim()).filter(Boolean));
    const staybackDays = new Set(d.staybackDates.split(',').map(s => s.trim()).filter(Boolean));
    const cur = new Date(d.claimFrom);
    const end = new Date(d.claimTo);
    while (cur <= end) {
      const iso = cur.toISOString().slice(0, 10);
      if (!leaveDays.has(iso) && !staybackDays.has(iso)) {
        total += (iso === d.claimFrom || iso === d.claimTo) ? RATE / 2 : RATE;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return total;
  })();
  const lodging = d.hotelStays.reduce((s, h) => s + nightsBetween(h.checkIn, h.checkOut) * h.ratePerNight, 0);
  const other = d.otherExpenses.reduce((s, e) => s + e.amount, 0);
  const total = travel + cab + da + lodging + other;
  const advance = d.advances.filter(a => a.selected).reduce((s, a) => s + a.amount, 0);
  const net = total - advance;
  return { travel, cab, da, lodging, other, total, advance, net };
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CreateClaim({ currentUser }: { currentUser?: User }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);

  // Initialise form with logged-in trainer's details from TDI_EMPLOYEES lookup
  const initialData = useMemo<FormData>(() => {
    if (!currentUser || currentUser.role !== 'Trainer') return DEFAULT;
    const rawCode = (currentUser.trainerId ?? '').replace(/^EMP-/i, '');
    const emp = TDI_EMPLOYEES.find(e => e.code === rawCode);
    return {
      ...DEFAULT,
      trainerName: currentUser.name || emp?.name || '',
      empCode: rawCode ? `EMP-${rawCode}` : '',
      department: emp ? 'Training Delivery Inhouse' : '',
      baseCity: emp?.city || '',
    };
  }, [currentUser]);

  const [d, setDRaw] = useState<FormData>(initialData);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const s = (patch: Partial<FormData>) => setDRaw(prev => ({ ...prev, ...patch }));
  const totals = useMemo(() => calcTotals(d), [d]);

  const handleSubmit = async () => {
    if (SUBMISSIONS_CLOSED) { alert('New TA/DA claim submissions are closed on this dashboard.'); return; }
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 1200));
    saveClaim({
      claimId: 'claim_' + Date.now(),
      billNo: `KNG-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
      trainerId: d.empCode,
      trainerName: d.trainerName,
      assignmentIds: [],
      batchIds: [],
      clientName: d.clientName,
      courseName: '',
      trainingLocation: d.venue,
      claimStartDate: d.claimFrom,
      claimEndDate: d.claimTo,
      baseCity: d.baseCity,
      destinationCities: [d.city],
      status: 'Submitted',
      pendingWith: 'HR/Admin',
      submittedAt: new Date().toISOString(),
      lastActionAt: new Date().toISOString(),
      adminOwnerId: '',
      totalClaimedAmount: totals.total,
      eligibleAmount: totals.total,
      approvedAmount: 0,
      deductionAmount: 0,
      advanceAdjusted: totals.advance,
      miscAdjustments: 0,
      recoverableAmount: 0,
      netPayable: totals.net,
      currency: 'INR',
      exceptionFlag: false,
      missingDocumentFlag: false,
      duplicateFlag: false,
      ledgerMismatchFlag: false,
      slaBreached: false,
      paymentStatus: 'Unpaid',
      agingDays: 0,
    });
    clearDraftWizard();
    setSubmitting(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 text-center px-4">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Claim Submitted!</h2>
          <p className="text-gray-500 mt-2 max-w-sm">Your TA/DA claim has been submitted to HR/Admin for review.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate('/claims')}
            className="px-5 py-2.5 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition-colors">
            View My Bills
          </button>
          <button onClick={() => navigate('/dashboard')}
            className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-colors">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button type="button" onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-800">New TA/DA Bill</h1>
          <p className="text-sm text-gray-500">Fill in all details and submit your claim</p>
        </div>
      </div>

      {/* Tab bar — all tabs clickable */}
      <div className="flex items-center mb-6 gap-0">
        {TABS.map((label, i) => (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <button type="button" onClick={() => setTab(i)}
              className="flex flex-col items-center gap-1 min-w-0 flex-shrink-0">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                i < tab ? 'bg-green-500 text-white' :
                i === tab ? 'bg-blue-600 text-white' :
                'bg-gray-200 text-gray-400 hover:bg-gray-300'
              }`}>
                {i < tab ? '✓' : i + 1}
              </div>
              <span className={`text-xs text-center leading-tight hidden sm:block ${
                i === tab ? 'text-blue-700 font-semibold' : 'text-gray-400'
              }`}>{label}</span>
            </button>
            {i < TABS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 mb-4 ${i < tab ? 'bg-green-400' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-[400px]">
        {tab === 0 && <Tab1 d={d} s={s} />}
        {tab === 1 && <Tab2 d={d} s={s} trainerEmail={currentUser?.email ?? ''} />}
        {tab === 2 && <Tab3 d={d} s={s} trainerEmail={currentUser?.email ?? ''} />}
        {tab === 3 && <Tab4 d={d} s={s} totals={totals} />}
        {tab === 4 && <Tab5 d={d} s={s} totals={totals} onSubmit={handleSubmit} submitting={submitting} />}
      </div>

      {/* Navigation */}
      {tab < 4 && (
        <div className="flex items-center justify-between pt-4 mt-4 border-t border-gray-200">
          <button type="button" onClick={() => setTab(t => Math.max(0, t - 1))} disabled={tab === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-40 transition-colors">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <span className="text-xs text-gray-400">{tab + 1} / {TABS.length}</span>
          <button type="button" onClick={() => setTab(t => Math.min(4, t + 1))}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors">
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

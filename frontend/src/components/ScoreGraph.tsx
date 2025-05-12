import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  // ReferenceDot, // Unused
} from 'recharts';
import { Payload } from 'recharts/types/component/DefaultTooltipContent'; // Import Payload type

// Define ScoreEntry interface
interface ScoreEntry {
  time: string | number; // Using 'time' as per mockScoreData and existing graph structure
  score_value: number;
  reason?: string;
  sc9_vs_theebis?: number; // Keep if used by mock data lines
  sc9_vs_vough?: number;   // Keep if used by mock data lines
  user?: string;
}

// Logged-in user (for mock data perspective) - This seems to be for mock data, consider removing if real data is used
// const currentUserId = "stinky_cat9";
const currentUserDisplayName = "Stinky Cat9";

const mockScoreData: ScoreEntry[] = [
  { time: 'Jan', sc9_vs_theebis: 5, sc9_vs_vough: 10, score_value: 0 },
  { time: 'Feb', sc9_vs_theebis: 0, sc9_vs_vough: 50, score_value: 0 },
  { time: 'Mar', sc9_vs_theebis: -50, sc9_vs_vough: 200, score_value: 0 },
  { time: 'Apr', sc9_vs_theebis: -200, sc9_vs_vough: 500, score_value: 0 },
  { time: 'May', sc9_vs_theebis: -1000, sc9_vs_vough: 1000, score_value: 0 },
];

// const mockUserPoints = [ // Unused
//   { time: 'Mar', value: -50, user: 'Theebis (from SC9)', pic: 'https://via.placeholder.com/30/00BCD4/FFFFFF?Text=T' },
//   { time: 'Apr', value: 500, user: 'Vough (from SC9)', pic: 'https://via.placeholder.com/30/FFC107/FFFFFF?Text=V' },
// ];

// const CustomDot = (props: any) => { // Unused
//   console.log("CustomDot props:", props);
//   const { cx, cy, payload, userPic, pointTime, pointUserLabel } = props;
// 
//   if (!payload || typeof payload.time === 'undefined') {
//     return (
//       <g>
//         <title>Error: Recharts internal data missing for this reference point.</title>
//         <circle cx={cx} cy={cy} r={8} fill="#ff0000" stroke="#fff" strokeWidth={2} />
//       </g>
//     );
//   }
// 
//   if (!userPic) {
//     return <circle cx={cx} cy={cy} r={5} fill="#8884d8" stroke="#fff" strokeWidth={1} />;
//   }
// 
//   const clipId = `clip-${pointTime}-${pointUserLabel?.replace(/[\s()]/g, '-')}`; // Corrected regex
// 
//   return (
//     <svg x={cx - 15} y={cy - 15} width={30} height={30} viewBox="0 0 100 100">
//       <defs>
//         <clipPath id={clipId}>
//           <circle cx="50" cy="50" r="50" />
//         </clipPath>
//       </defs>
//       <image
//         href={userPic}
//         width="100"
//         height="100"
//         clipPath={`url(#${clipId})`}
//       />
//     </svg>
//   );
// };

interface ScoreGraphProps {
  data: ScoreEntry[];
  // currentUserId?: string; // Unused, commented out
}

const ScoreGraph: React.FC<ScoreGraphProps> = ({ data }) => {
  const displayData = (!data || data.length === 0) ? mockScoreData : data;
  const isMockData = (!data || data.length === 0);

  return (
    <div className="score-graph-container" style={{ width: '100%', height: 500 }}>
      <h2>Discord Social Credit {isMockData ? "(Mock Data)" : ""}</h2>
      <ResponsiveContainer>
        <LineChart data={displayData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="time" // Use 'time' as per ScoreEntry and mockScoreData
            tickFormatter={(label) => {
              // Format if it looks like a date/timestamp, otherwise return as is (e.g., 'Jan')
              if (typeof label === 'number' || (typeof label === 'string' && !isNaN(Date.parse(label)))) {
                const date = new Date(label);
                const formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const formattedDate = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                return `${formattedDate} (${formattedTime})`;
              }
              return label;
            }}
          />
          <YAxis dataKey="score_value" type="number" domain={['auto', 'auto']} allowDataOverflow={!isMockData} />
          <Tooltip
            labelFormatter={(label: string | number) => {
              if (typeof label === 'number' || (typeof label === 'string' && !isNaN(Date.parse(label)))) {
                const date = new Date(label);
                const formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const formattedDate = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                return `${formattedDate} (${formattedTime})`;
              }
              return label;
            }}
            formatter={(value: number, name: string, item: Payload<number, string>) => {
              const entryPayload = item.payload as ScoreEntry; // Cast to ScoreEntry
              const reasonText = entryPayload.reason ? ` (${entryPayload.reason})` : '';
              const userText = entryPayload.user ? `${entryPayload.user}: ` : '';

              // For mock data, the 'name' refers to dataKeys like 'sc9_vs_theebis'
              // For real data, 'name' would likely be 'score_value' or similar.
              if (isMockData) {
                // 'name' here is one of the series keys like 'sc9_vs_theebis'
                // 'value' is the score for that series at this point.
                let seriesName = name;
                if (name === 'sc9_vs_theebis') seriesName = `${currentUserDisplayName} -> Theebis`;
                if (name === 'sc9_vs_vough') seriesName = `${currentUserDisplayName} -> Vough`;
                return [`${seriesName}: ${value}`, null]; // Second element can be null or a specific label
              }
              // For actual data, we expect a single line usually.
              return [`${userText}Score: ${value}${reasonText}`, null];
            }}
          />
          <Legend />
          {isMockData ? (
            <>
              <Line type="monotone" dataKey="sc9_vs_theebis" stroke="#8884d8" activeDot={{ r: 8 }} name={`${currentUserDisplayName} -> Theebis`} />
              <Line type="monotone" dataKey="sc9_vs_vough" stroke="#82ca9d" activeDot={{ r: 8 }} name={`${currentUserDisplayName} -> Vough`} />
            </>
          ) : (
            <Line type="monotone" dataKey="score_value" stroke="#8884d8" activeDot={{ r: 8 }} name="Score Over Time" />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ScoreGraph; 
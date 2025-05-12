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
} from 'recharts';
import { Payload } from 'recharts/types/component/DefaultTooltipContent';

// Define ScoreEntry interface to match backend (ScoreEntry model in main.py)
export interface ScoreEntry {
  timestamp: number; // Changed to number (epoch milliseconds)
  score_value: number;
  reason?: string | null;
  // Remove mock data specific fields like sc9_vs_theebis, sc9_vs_vough, user, time
}

// const currentUserDisplayName = "Stinky Cat9"; // No longer needed for mock specific lines

// Remove mockScoreData or keep it for fallback if data is empty, but ensure it matches new ScoreEntry
const mockScoreFallbackData: ScoreEntry[] = [
  // Example: { timestamp: new Date().toISOString(), score_value: 0, reason: "Initial (Mock)" },
];

interface ScoreGraphProps {
  data: ScoreEntry[];
  graphTitle?: string; // Optional title for the graph, e.g., "Scores for [User]"
}

const ScoreGraph: React.FC<ScoreGraphProps> = ({ data, graphTitle }) => {
  const displayData = (!data || data.length === 0) ? mockScoreFallbackData : data;
  const isMockData = (!data || data.length === 0) && mockScoreFallbackData.length > 0;
  const effectiveTitle = graphTitle || "Social Credit Score Over Time";

  if (displayData.length === 0 && !isMockData) {
    return (
      <div className="score-graph-container" style={{ width: '100%', height: 300, textAlign: 'center', paddingTop: '20px' }}>
        <h3>{effectiveTitle}</h3>
        <p>No score data available to display.</p>
      </div>
    );
  }

  return (
    <div className="score-graph-container" style={{ width: '100%', height: 300 }}>
      <h3>{effectiveTitle}</h3>
      <ResponsiveContainer>
        <LineChart data={displayData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(numericalTimestamp) => { // Expects number
              if (typeof numericalTimestamp !== 'number') return '';
              try {
                const date = new Date(numericalTimestamp);
                // Show date and time if data spans less than ~3 days, otherwise just date
                if (displayData.length > 1) {
                  const firstDate = displayData[0].timestamp; // Already a number
                  const lastDate = displayData[displayData.length - 1].timestamp; // Already a number
                  if (Math.abs(lastDate - firstDate) < 3 * 24 * 60 * 60 * 1000) { // Less than 3 days
                    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                  }
                }
                return date.toLocaleDateString([], { year: '2-digit', month: 'short', day: 'numeric' });
              } catch (e) {
                return 'Invalid Date';
              }
            }}
            domain={['dataMin', 'dataMax']}
            type="number"
            scale="time"
          />
          <YAxis dataKey="score_value" type="number" domain={['auto', 'auto']} allowDataOverflow />
          <Tooltip
            labelFormatter={(numericalTimestamp: number) => { // Expects number
              if (typeof numericalTimestamp !== 'number') return '';
              try {
                const date = new Date(numericalTimestamp);
                return date.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
              } catch (e) {
                return 'Invalid Date';
              }
            }}
            formatter={(value: number, name: string, item: Payload<number, string>) => {
              const entryPayload = item.payload as ScoreEntry;
              const reasonText = entryPayload.reason ? ` (Reason: ${entryPayload.reason})` : '';
              return [`Score: ${value}${reasonText}`, null]; // Name can be null if only one line
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="score_value"
            stroke="#8884d8"
            activeDot={{ r: 6 }}
            name="Score"
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ScoreGraph; 
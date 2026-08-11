const BAND_MEMBERS = [
  {
    name: 'Mathavan Arumugham',
    role: 'Circuit Design and Firmware',
    bio: 'Mathavan is a talented hardware engineer from the LA area with a love for music. He plays a traditional south Indian instrument called the mridangam, which is a type of drum. He has been playing the mridangam for over 10 years and has performed in many concerts and competitions.',
    photo: '/mathavan_arumugham.jpg',
  },
  {
    name: 'Shreya Pandey',
    role: 'CAD Design and Fabrication',
    bio: 'Shreya is a skilled chemical engineer from the bay with a love for archery! She is transferring to UCLA next quarter and is excited to continue learning and sharpening her skills',
    photo: '/shreya_pandey.jpg',
  },
  {
    name: 'Luis Romo',
    role: 'CAD Design and Fabrication',
    bio: 'Luis is a talented CAD designer and fabricator with a passion for music from Cerritos College. He is a Pre-ops participant and has been involved in various robotics projects and is excited to contribute to the MINNIE-1.',
    photo: '/luis_romo.jpg',
  },
  {
    name: 'Jonathan Maloney',
    role: 'Web Design and Serial Communication',
    bio: 'Jonathan is a talented web developer who has a cat named Vector. He is transferring to UCLA next quarter and is excited to join IEEE at UCLA and work on analog synthesizers and other electronics projects.',
    photo: '/jonathanmaloney.jpg',
  },
];

function Home() {
  return (
    <div className="home">
      <h1>MINNIE-1</h1>
      <p>
        The MINNIE-1 is Mickey Mouse Robotics' latest invention! A handheld electric guitar built on a Raspberry Pi Pico 2W. Eight
        buttons, three effects, and a speaker all fit into a compact, 3D-printed enclosure. The sound is produced by
        wavetable synthesis, all wired up by hand.
      </p>

      {/* ================= INSTRUMENT DETAILS ================= */}
      <section className="section">
        <h2>Sound &amp; Design</h2>
        <p>
          {/* Describe playable range, key/scale flexibility, and how pitch
              is produced -- e.g. "Eight frets span a full octave and can be
              re-tuned to any key/scale by changing the note table in
              firmware, so the range isn't locked to one fixed scale." */}
          Each of the eight frets plays one note, spanning a full octave.
          The note table is defined in software, so the whole octave can be
          retuned played.
        </p>

        <h3>Effects</h3>
        <ul className="effects-list">
          <li>
            <strong>Arpeggiator</strong> — holding multiple frets cycles
            through them at a speed set by the Arpeggiator pot, from a slow,
            distinct arpeggio to a fast trill.
          </li>
          <li>
            <strong>Sustain</strong> — releasing all frets fades the last
            chord out over a pot-controlled tail instead of cutting off
            instantly.
          </li>
          <li>
            <strong>Tremolo</strong> — layers a second, slightly detuned
            voice under each note, producing a pulsing "beating" texture.
          </li>
        </ul>

        <h3>Volume</h3>
        <p>
          A dedicated potentiometer controls output level digitally in
          firmware (scaling every audio sample before it's sent to the
          speaker), separate from the effect controls above.
        </p>

        <h3>Vibe</h3>
        <p>
          {/* A couple sentences on the aesthetic / build choices -- what it
              looks like, what inspired the enclosure, why this sound. */}
          A sleek LED readout showing live note/effect state, and
          a synth voice that leans warm and analog-ish despite being built
          entirely in software, give the MINNIE-1 a unique character. The enclosure is 3D-printed in a single piece, with a smooth, ergonomic shape that fits comfortably in the hand.
        </p>
      </section>

      <p>
        Head to the Visualizer tab to see it respond live to what's being
        played! Every note, effect, and control change is streamed to this
        site over USB in real time.
      </p>

      {/* ================= BAND PHOTO ================= */}
      <section className="section">
        <h2>Mickey Mouse Robotics LLC</h2>
        <img
          className="band-photo"
          src="/group_photo.jpg"
          alt="The full band"
        />
      </section>

      {/* ================= MEMBER INTROS ================= */}
      <section className="section">
        <div className="members-grid">
          {BAND_MEMBERS.map((member) => (
            <div className="member-card" key={member.name}>
              <img src={member.photo} alt={member.name} />
              <h3>{member.name}</h3>
              <p className="member-role">{member.role}</p>
              <p>{member.bio}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ================= SETLIST RECORDINGS ================= */}
      <section className="section">
        <h2>Setlist</h2>
        <p>TBA!</p>
      </section>
    </div>
  );
}

export default Home;
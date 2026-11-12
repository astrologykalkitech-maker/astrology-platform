import { ProtectionRitual } from "@/app/actions/protection-rituals";

export const RITUAL_CATALOG: Omit<ProtectionRitual, "is_saved" | "completion_count" | "last_completed_at">[] = [
  // 1. Evil Eye / Drishti Dosha
  {
    id: "evil-eye-cleansing",
    slug: "drishti-dosha-nivarana",
    title: "Drishti Dosha Nivarana (Traditional Salt & Mustard Cleansing)",
    category: "evil_eye",
    purpose: "Disperse psychic tension, heavy auric burden, and malicious envy (buri nazar) through traditional household elemental cleansing.",
    description: "A centuries-old Vedic household practice observed across Northern and Southern India utilizing rock salt, black mustard seeds, and dried red chilies to absorb and neutralize heavy energetic projections.",
    traditional_background: "Described in classical folk-Vedic traditions and Atharva-Vedic pacification procedures where Lavana (salt) and Sarshapa (mustard) act as natural earth-element psychic absorbents.",
    eligibility: "Suitable for all adults and family members feeling unusual emotional fatigue, restlessness, or sudden household heaviness.",
    required_materials: [
      "Pure rock salt (Sendha Namak)",
      "Yellow or black mustard seeds (Sarson)",
      "3 whole dried red chilies with stalks intact",
      "Earthen diya or open ember bowl",
      "Clean water for hand ablution"
    ],
    instructions: [
      "Sit peacefully facing the East or North in a clean space during evening twilight (Sandhya).",
      "Place a fistful of rock salt, mustard seeds, and three intact dried red chilies in your right hand.",
      "Gently close your fist and rotate it clockwise around the crown and torso 7 times while mentally reciting the Gayatri Mantra or Mahamrityunjaya Mantra.",
      "Carefully deposit the mixture onto a lit charcoal briquette, open diya, or flowing water without inhaling the smoke directly.",
      "Wash your hands and face with cool water and sit quietly for two minutes to ground your awareness."
    ],
    duration_minutes: 10,
    frequency: "Weekly on Tuesday or Saturday evenings, or immediately following acute social overwhelm",
    precautions: "Do not inhale the fumes directly when the seeds and chilies crackle. Always ensure proper cross-ventilation in the room.",
    contraindications: "Avoid burning chili mixture in closed rooms with infants, pregnant women, or individuals suffering from asthma or acute respiratory distress.",
    alternative: "If smoke irritates your lungs, dissolve the rock salt and mustard seeds in a bowl of warm water, rotate it clockwise 7 times around the individual, and pour the water directly down a drainage outlet."
  },
  {
    id: "lemon-chili-threshold",
    slug: "nimbu-mirchi-dwar-raksha",
    title: "Nimbu-Mirchi Dwar Raksha (Threshold Elemental Absorber)",
    category: "evil_eye",
    purpose: "Shield the domestic threshold against malefic intent, pedestrian negativity, and sudden energetic intrusion.",
    description: "Traditional hanging of seven fresh green chilies and an unblemished lemon strung with a black thread at the main doorway of residences and business establishments.",
    traditional_background: "Rooted in traditional Vastu and Alakshmi pacification customs, where Alakshmi (goddess of adversity) consumes sour and spicy elements at the perimeter, sparing the inner sanctum.",
    eligibility: "Universal for residential homes, consultation chambers, and storefronts.",
    required_materials: [
      "1 ripe, unblemished yellow or green lemon",
      "7 fresh, firm green chilies",
      "Natural black cotton thread (Kala Dhaga)",
      "Sewing needle",
      "Small piece of natural charcoal (optional)"
    ],
    instructions: [
      "On Tuesday or Saturday morning, pierce the center of the lemon and string the 7 green chilies above it along a durable black cotton thread.",
      "Optionally thread a small piece of natural charcoal at the bottom to absorb ambient electromagnetic dryness.",
      "Chant 'Om Namo Bhagavate Vasudevaya' or 'Om Dum Durgayei Namah' 7 times while tying.",
      "Hang the consecrated string centrally above or adjacent to the outer door frame.",
      "Replace every 7 to 10 days, or as soon as the lemon shrivels or turns dark."
    ],
    duration_minutes: 15,
    frequency: "Replaced weekly on Tuesdays or Saturdays",
    precautions: "Handle green chilies carefully to prevent touching eyes. Wash hands thoroughly with soap after handling.",
    contraindications: "Never leave rotting or heavily moldy lemons hanging at the doorway; remove immediately upon decay.",
    alternative: "If natural lemon-chili cannot be strung, place an auspicious brass Swastika or Panchamukhi Hanuman plaque above the doorway at eye level."
  },

  // 2. Negative Energy & Space Peace
  {
    id: "guggal-loban-fumigation",
    slug: "sambrani-guggal-shuddhi",
    title: "Guggal & Sambrani Loban Dhoop (Resin Smoke Consecration)",
    category: "negative_energy",
    purpose: "Clear lingering grief, discord, and stagnant atmospheric heaviness from indoor rooms.",
    description: "Classical fumigation utilizing pure Commiphora mukul (Guggal) resin, styrax benzoin (Loban), and natural camphor to sanctify domestic air and elevate ambient frequency.",
    traditional_background: "Prescribed in Ayurvedic Dhoopana protocols and Atharvana rituals for atmospheric sterilization and balancing Vata-Kapha atmospheric imbalances.",
    eligibility: "Suitable for home cleansing after arguments, illnesses, long travels, or before beginning auspicious endeavors.",
    required_materials: [
      "Pure organic Guggal resin crystals",
      "Natural Sambrani (Loban) pieces",
      "Bhimseni (edible-grade) camphor tablets",
      "Coconut shell briquette or natural cow dung dhoop base",
      "Brass or earthenware incense carrier with handle"
    ],
    instructions: [
      "Open exterior windows partially to allow displaced atmospheric stagnation to exit the premises.",
      "Light the charcoal or cow dung base until glowing embers form in the burner.",
      "Sprinkle a pinch of powdered Guggal and crushed Loban resin directly onto the glowing ember.",
      "Walk calmly clockwise through each room of your residence, guiding the smoke along corners and perimeter walls while reciting 'Om Shanti Shanti Shanti'.",
      "Place the vessel safely in the North-East or main living hall until it naturally extinguishes."
    ],
    duration_minutes: 20,
    frequency: "Twice weekly during evening Sandhya twilight or immediately after deep physical cleaning",
    precautions: "Keep hot embers away from curtains, upholstery, and wooden fixtures. Never leave burning incense unattended.",
    contraindications: "Do not perform in enclosed, poorly ventilated bedrooms or near individuals experiencing acute respiratory allergies or bronchitis.",
    alternative: "Diffuse pure essential oils of Frankincense (Boswellia serrata) and Sandalwood in an ultrasonic water diffuser instead of burning resin."
  },
  {
    id: "rock-salt-water-grounding",
    slug: "sendha-namak-jal-shuddhi",
    title: "Sendha Namak Jal Shuddhi (Salt Water Foot Grounding)",
    category: "negative_energy",
    purpose: "Discharge emotional exhaustion, psychic static, and accumulated negative thought patterns through foot transdermal grounding.",
    description: "A calming evening hydrotherapy practice combining warm water, raw Himalayan rock salt, and essential relaxation to ground excess nervous Vata energy.",
    traditional_background: "Derived from traditional Naturopathic and Ayurvedic Snana cleansing routines where salt draws out excess Pitta and grounds restless mental agitation into water.",
    eligibility: "Highly recommended for consultants, astrologers, counselors, and professionals interacting with emotionally strained seekers.",
    required_materials: [
      "1 bucket or basin large enough to submerge both feet to ankles",
      "2 tablespoons of unrefined Himalayan rock salt or Sea salt",
      "Warm, comfortable water (38–40°C)",
      "Clean cotton foot towel",
      "2 drops of lavender or eucalyptus essential oil (optional)"
    ],
    instructions: [
      "Fill the basin with comfortably warm water and dissolve two tablespoons of pure rock salt completely.",
      "Sit on a comfortable chair, submerge your feet up to the ankles, and rest your hands palms upward on your thighs.",
      "Close your eyes and breathe deeply for 10 to 15 minutes, visualizing accumulated stress draining out from the soles of your feet.",
      "Gently remove your feet, rinse with clean warm water, and dry thoroughly with a towel.",
      "Discard the foot-soak water down the toilet immediately; do not pour it into domestic garden plants."
    ],
    duration_minutes: 15,
    frequency: "Daily before sleep or after exhausting consultations",
    precautions: "Water must be comfortable, never scalding. Keep electronics and cords away from the water basin.",
    contraindications: "Avoid if you have open sores, active eczema flares, or severe diabetic ulcers on your feet.",
    alternative: "If foot immersion is not feasible, wash both hands to the elbows in lukewarm saline water followed by cool water."
  },

  // 3. Home Protection & Vastu
  {
    id: "gangajal-turmeric-sprinkling",
    slug: "gangajal-haldi-griha-sinchan",
    title: "Gangajal & Haldi Griha Sinchan (Sanctified Water Perimeter Consecration)",
    category: "home",
    purpose: "Consecrate perimeter boundaries, seal doorways against psychic intrusion, and establish auspicious domestic peace.",
    description: "Sprinkling holy water infused with wild turmeric powder and fresh mango leaves across the four cardinal corners of the home.",
    traditional_background: "Documented in Grihya Sutras as 'Prokshana'—the ritual sanctification of dwelling quarters using water and sacred botanicals (Haridra and Tulsi).",
    eligibility: "All householders, tenants moving into new residences, or families revitalizing their home atmosphere.",
    required_materials: [
      "Copper or brass vessel (Lota)",
      "Clean water infused with a few drops of Gangajal",
      "Half teaspoon of organic turmeric powder (Haldi)",
      "5 fresh Mango leaves or a sprig of sacred Tulsi leaves",
      "A pinch of Kumkum for threshold mark"
    ],
    instructions: [
      "Early in the morning after bathing, fill the copper pot with water and stir in Gangajal and organic turmeric.",
      "Hold the mango leaves or Tulsi sprig with your right hand and dip them into the water.",
      "Begin at the Ishanya (North-East) corner of the residence and sprinkle gentle droplets along perimeter walls while chanting 'Om Namo Narayanaya'.",
      "Progress clockwise through the East, South, West, and North corridors.",
      "Conclude at the main entrance, sprinkling the remaining water at the threshold and applying a gentle turmeric-kumkum tilak on both doorposts."
    ],
    duration_minutes: 15,
    frequency: "Weekly on Thursday or Sunday mornings, or on Amavasya / Purnima days",
    precautions: "Do not sprinkle on delicate fabrics or porous carpets that can be permanently stained by turmeric.",
    contraindications: "None. Suitable across all seasons and family environments.",
    alternative: "If Gangajal is unavailable, use fresh filtered water charged by standing in sunlight inside a brass vessel for 30 minutes while reciting the Gayatri Mantra."
  },
  {
    id: "vastu-salt-dish-placement",
    slug: "lavana-patra-vastu-dosha",
    title: "Lavana Patra Vastu Dosha Shanti (Corner Salt Dish Absorption)",
    category: "home",
    purpose: "Mitigate subtle Vastu directional imbalances and absorb damp psychic stagnant pockets in corners.",
    description: "Placing open earthenware bowls filled with unrefined rock salt crystals in directional corners (specifically South-West and bathrooms) to trap environmental dampness and heavy prana.",
    traditional_background: "Traditional folk Vastu practice capitalizing on halite crystals' hygroscopic and electromagnetic ionic absorption properties.",
    eligibility: "Ideal for apartments or rental accommodations where architectural renovations are impossible.",
    required_materials: [
      "Small ceramic, glass, or earthenware bowls (avoid metal)",
      "Unrefined rock salt chunks (Sendha Namak)",
      "Small drop of clove or camphor oil (optional)"
    ],
    instructions: [
      "Fill two small ceramic bowls with 100 grams of coarse rock salt each.",
      "Place one bowl unobtrusively in the South-West corner of the dwelling and another in damp or heavily enclosed washroom areas.",
      "Leave the bowl undisturbed for 14 days to naturally absorb energetic and physical atmospheric moisture.",
      "When the salt turns damp, dissolves, or darkens, discard it into running drainage water without touching it directly.",
      "Wash the bowl thoroughly and refill with fresh dry rock salt crystals."
    ],
    duration_minutes: 5,
    frequency: "Replace every 14 days or on monthly Amavasya (New Moon)",
    precautions: "Keep salt bowls out of reach of curious domestic pets and crawling infants.",
    contraindications: "Do not use metallic bowls (iron, copper, or aluminium) as salt induces rapid corrosion.",
    alternative: "Place a small natural Himalayan salt lamp on a dry wooden desk in the affected corner and illuminate for 3–4 hours daily."
  },

  // 4. Spiritual Protection
  {
    id: "maha-mrityunjaya-japa",
    slug: "maha-mrityunjaya-raksha-kavach",
    title: "Maha Mrityunjaya Raksha Kavach (Primordial Shiva Life-Shield)",
    category: "spiritual",
    purpose: "Invoke divine protection against sudden accidents, chronic vitality depletion, and mental fear of mortality.",
    description: "Japa recitation of the Vedic Maha Mrityunjaya Mantra utilizing a sanctified Rudraksha mala during the auspicious Brahma Muhurat window.",
    traditional_background: "Rigveda (7.59.12), revealed by Sage Vashistha; considered the sovereign protector mantra across all schools of Sanatana Dharma.",
    eligibility: "Anyone seeking inner fortitude, patients recovering from long ailments, and seekers undergoing intense Rahu/Ketu transits.",
    required_materials: [
      "108-bead authentic Rudraksha mala (5 Mukhi)",
      "Clean cotton or wool sitting mat (Asana)",
      "Pure ghee or sesame oil diya",
      "Small brass bell",
      "Cup of clean water for Achamana"
    ],
    instructions: [
      "Sit facing East or North on your asana between 4:30 AM and 6:30 AM after completing your morning ablutions.",
      "Light the ghee lamp and offer salutations to Lord Shiva with three deep breaths.",
      "Hold the Rudraksha mala in your right hand, moving beads with the thumb and middle finger (never index finger).",
      "Recite 108 times: 'Om Tryambakam Yajamahe Sugandhim Pushti-Vardhanam | Urvarukam-Iva Bandhanan Mrityor-Mukshiya Ma-Amritat'.",
      "Touch the Sumeru bead gently to your eyes and heart upon completion, maintaining silence for three minutes."
    ],
    duration_minutes: 20,
    frequency: "Daily morning practice for unbroken 40-day cycles or sustained lifetime observance",
    precautions: "Recite with calm, deliberate cadence rather than hurried pronunciation. Do not chant with anger or agitated breathing.",
    contraindications: "None. Can be practiced by all individuals regardless of gender, background, or ashrama.",
    alternative: "If 108 audible chants are tiring, practice 11 mindful repetitions in the morning and 11 in the evening with heartfelt devotion."
  },
  {
    id: "hanuman-chalisa-kavach",
    slug: "sri-hanuman-raksha-kavach",
    title: "Sri Hanuman Raksha Kavach (Fearlessness & Courage Invocation)",
    category: "spiritual",
    purpose: "Dispel irrational nocturnal phobias, sleep paralysis, panic episodes, and psychic vulnerability.",
    description: "Devotional recitation of Goswami Tulsidas's Sri Hanuman Chalisa, preceded by Sankalpa and lighting of a jasmine oil or mustard oil lamp.",
    traditional_background: "Originating in the Awadhi Bhakti canon (16th century); widely recognized as the supreme everyday spiritual shield for common householders.",
    eligibility: "Anyone suffering from nightmare patterns, unexplained anxiety in darkness, or severe Mars-Saturn affliction in birth chart.",
    required_materials: [
      "Sri Hanuman Chalisa text or script",
      "Earthen lamp with mustard oil or jasmine (Chameli) oil",
      "Red sandalwood or Sindoor tilak",
      "Small offering of jaggery (Gud) or soaked chana"
    ],
    instructions: [
      "Wash hands, feet, and face, then sit comfortably facing North or East.",
      "Light the earthen lamp before an image or symbol of Sri Hanuman.",
      "Begin by chanting 'Sri Ram Jai Ram Jai Jai Ram' three times to anchor divine humility.",
      "Recite the 40 chaupais of Sri Hanuman Chalisa with focused devotion and clarity.",
      "Conclude by reciting the concluding Doha: 'Pavan Tanay Sankat Haran Mangal Murti Roop...', take a pinch of sindoor from the lotus feet and apply to your forehead."
    ],
    duration_minutes: 15,
    frequency: "Daily at dusk, or 7 recitations consecutively on Tuesdays and Saturdays",
    precautions: "Maintain high physical and dietary cleanliness on days of specialized sadhana.",
    contraindications: "None. Universal spiritual refuge.",
    alternative: "Listen mindfully to an authentic acoustic recitation while sitting in upright meditative posture with eyes closed."
  },

  // 5. Personal & Karmic Practices
  {
    id: "shani-chhaya-daan",
    slug: "shani-peeda-shanti-chhaya-daan",
    title: "Shani Peeda Shanti Chhaya Daan (Karmic Shadow Alleviation)",
    category: "personal",
    purpose: "Alleviate karmic resistance, delays, and chronic frustration during Saturn Sade Sati or Ashtama Shani.",
    description: "The classical ritual of reflecting one's facial shadow in pure cold-pressed mustard oil followed by donating it with black sesame seeds.",
    traditional_background: "Classical remedial discipline referenced in Jyotish Shastras (Brihat Parashara Hora Shastra remedies) to pacify malefic planetary Drishti of Saturn.",
    eligibility: "Recommended for individuals undergoing Saturn Sade Sati (first, second, or third cycle), Dhaiya, or Saturn Dasha with chronic delays.",
    required_materials: [
      "150–200 ml pure dark mustard oil (Sarson ka Tel)",
      "Small iron or earthen bowl (Katori)",
      "1 tablespoon black sesame seeds (Kala Til)",
      "1 iron coin or small iron washer",
      "Black cloth piece (optional)"
    ],
    instructions: [
      "On Saturday morning before 10:00 AM or Saturday evening after sunset, pour mustard oil into the iron or clay bowl.",
      "Add the black sesame seeds and the iron coin into the oil.",
      "Hold the bowl with both hands, gaze intently into the oil surface, and clearly observe the reflection of your face for 60 seconds.",
      "Quietly chant 'Om Sham Shanaishcharaya Namah' 11 or 21 times, acknowledging your lessons of patience, duty, and humility.",
      "Donate the oil bowl at a local Shani temple (Daan Patra) or hand it respectfully to an elderly destitute person or dakaut."
    ],
    duration_minutes: 15,
    frequency: "Saturdays, especially during Shanipradoham or Amavasya Saturdays",
    precautions: "Do not reuse or bring back the oil into your domestic kitchen. Do not consume mustard oil used for Chhaya Daan.",
    contraindications: "Not required for individuals currently enjoying strong, benefic Saturn transit in 3rd, 6th, or 11th houses.",
    alternative: "If temple donation is unavailable, feed black sesame roti, cooked rice with sesame, or soaked black gram (chana) to stray black dogs or cows on Saturday afternoon."
  },
  {
    id: "rahu-ketu-bhairav-deepam",
    slug: "kala-bhairava-deepa-samarpana",
    title: "Kala Bhairava Deepa Samarpana (Time & Illusion Neutralizer)",
    category: "personal",
    purpose: "Clear mental illusion, addiction tendencies, deception anxiety, and destabilizing Rahu-Ketu nodal afflictions.",
    description: "Offering a mustard or sesame oil deepam in a halved ash gourd or whole lime to Lord Kala Bhairava during Rahu Kalam.",
    traditional_background: "Ancient Southern Tantra and Agama tradition acknowledging Kala Bhairava as the supreme sovereign of Time and ruler of Rahu's karmic knots.",
    eligibility: "Seekers facing sudden legal entanglement, deceit, obsessive paranoia, or running Rahu Mahadasha / Rahu Antardasha.",
    required_materials: [
      "1 earthen diya or a halved lime with pulp scooped out",
      "Pure sesame oil or mustard oil",
      "Thick cotton wick",
      "Black peppercorns (Milagu) tied in a small cotton pouch",
      "Matchbox"
    ],
    instructions: [
      "Locate the local planetary Rahu Kalam timing on Tuesday or Sunday afternoon.",
      "Place the wick and oil in the earthenware lamp or lime half, inserting the small pepper pouch alongside.",
      "Light the lamp facing South or West before Lord Kala Bhairava's altar or in a quiet temple courtyard.",
      "Recite the Kala Bhairav Ashtakam or simply repeat: 'Om Bhram Bhairavaya Namah' 21 times.",
      "Stand with hands folded, ask for forgiveness for unintentional debts and errors, and return home without looking backwards."
    ],
    duration_minutes: 20,
    frequency: "Tuesdays or Sundays during designated Rahu Kalam, or on monthly Ashtami tithi",
    precautions: "Maintain absolute reverent focus. Never blow out consecrated deepams with human breath.",
    contraindications: "Avoid performing within private home bedrooms; practice in the home puja altar, balcony, or consecrated temple grounds.",
    alternative: "Feed stray black dogs (considered Bhairava's vahanas) with fresh milk, unsalted bread, or biscuits on Sunday evenings."
  },

  // 6. Navagraha & Vedic Observances
  {
    id: "surya-arghya-gayatri",
    slug: "aditya-hridaya-surya-arghya",
    title: "Surya Arghya & Aditya Stuti (Vital Solar Radiance Consecration)",
    category: "vedic",
    purpose: "Strengthen self-confidence, heart vitality, fatherly blessings, and professional dignity against malefic solar afflictions.",
    description: "The timeless Vedic morning discipline of offering clean water from a copper vessel to the rising Sun while chanting sacred solar Suktas.",
    traditional_background: "Prescribed throughout the Vedas, Taittiriya Aranyaka, and the Valmiki Ramayana (Aditya Hridaya Stotram impartation by Sage Agastya to Lord Rama).",
    eligibility: "Universal daily practice for all students, leaders, administrators, and individuals feeling lack of vitality or willpower.",
    required_materials: [
      "Pure copper pot (Tamra Jalpatra)",
      "Clean fresh water",
      "Pinch of red sandalwood powder (Rakta Chandana) or Kumkum",
      "Fresh red flower (e.g., Hibiscus) or pinch of whole rice (Akshat)",
      "Clean ground or water collection vessel"
    ],
    instructions: [
      "Wake during sunrise, complete bodily ablutions, and dress in fresh clean clothing.",
      "Fill the copper vessel with water, adding red sandalwood powder, akshat, and a red flower.",
      "Step outside onto soil, grass, or balcony, facing the rising Sun in the East.",
      "Raise the vessel with both hands above eye level, tilting gently so water streams down in a steady current.",
      "Gaze at the solar disc through the streaming water veil while reciting: 'Om Suryaya Namah, Om Adityaya Namah' or the Gayatri Mantra three times.",
      "Touch your moist ring fingers to your eyes and throat upon conclusion to absorb the light prana."
    ],
    duration_minutes: 10,
    frequency: "Daily during sunrise (within 1 hour of dawn)",
    precautions: "Do not step directly on the offered water; ensure water flows into soil, a tulsi plant pot, or a clean collection pan.",
    contraindications: "None. Beneficial for all constitutions and birth charts.",
    alternative: "On cloudy days or in winter locations where direct sunlight is obscured, face East toward the dawn horizon and visualize the golden solar orb while chanting."
  },
  {
    id: "tulsi-sandhya-deepam",
    slug: "vrinda-tulsi-sandhya-deepam",
    title: "Vrinda Tulsi Sandhya Deepam (Domestic Harmony & Aura Shield)",
    category: "vedic",
    purpose: "Infuse the courtyard with sattvic prana, harmonize household relationships, and invite Vrinda Devi's protective shield.",
    description: "Lighting a pure cow ghee lamp at the base of the sacred Tulsi plant during evening twilight accompanied by Pradakshina.",
    traditional_background: "Padma Purana and Skanda Purana praise Tulsi as the embodiment of Mahalakshmi and the natural absorbent of domestic discord.",
    eligibility: "Households cultivating live sacred Tulsi (Ocimum sanctum) plants in courtyards or balconies.",
    required_materials: [
      "Living, healthy Holy Basil (Tulsi) plant",
      "Small clay or brass diya with pure cow ghee",
      "Cotton wick",
      "Pinch of turmeric and kumkum",
      "Fresh water sprinkler"
    ],
    instructions: [
      "During evening twilight (Sandhya), sweep and wipe the platform around the Tulsi planter.",
      "Light the cow ghee diya and position it on the designated shelf or ground near the base of the planter.",
      "Offer salutations with folded palms: 'Tulasi Devi Namastubhyam Namah Shakhi-Priye Shubhe'.",
      "Circumambulate (Pradakshina) the Tulsi plant clockwise 3 times with reverence.",
      "Stand quietly for one minute breathing in the natural aromatic volatile oils emitted by the sacred plant."
    ],
    duration_minutes: 10,
    frequency: "Daily at evening sunset twilight (Sandhya)",
    precautions: "Do not touch, pluck leaves, or pour water on Tulsi after sunset. Only illuminate the lamp with reverent distance.",
    contraindications: "None. Universal domestic harmony practice.",
    alternative: "If an outdoor Tulsi plant cannot be grown in cold climates, place a sacred Tulsi wood mala (Kanthi) in your prayer altar and illuminate a ghee diya before it."
  }
];


"""One-off: apply the fact-check corrections to entries.js and extras.js."""
E = [
# 50-41
('contain small amounts of <b>urushiol</b>, the same oily chemical that makes poison ivy itch. The juicy fruit inside has little or none.', 'contain <b>chemicals very similar to urushiol</b>, the oil that makes poison ivy itch. The juicy fruit inside has little or none.'),
('The mango is the national fruit of India, Pakistan, and the Philippines.', 'The mango is treated as the national fruit in India, Pakistan, and the Philippines.'),
('Oily, orange diarrhea that is hard to control', 'Oily orange or brownish-green leakage that is hard to control'),
('Because of its effect on the stomach, escolar has earned the rude nickname \\"the ex-lax fish.\\"', "Escolar's oil can leak out with no warning. Doctors have a name for this: keriorrhea (keh-ree-oh-REE-uh)."),
('The shell around the nut contains <b>urushiol</b>, the same oil that makes poison ivy itch.', 'The shell around the nut contains an oil with <b>cardol and anacardic acid</b>, close cousins of the urushiol in poison ivy.'),
('Most people will never come across a truly raw cashew.', 'Most people will never come across a truly raw cashew, though badly processed cashews have very rarely caused rashes.'),
('This removes most of the harmful chemicals, but it leaves behind a powerful smell of ammonia.', 'This breaks down the harmful chemical, but it also makes other strong-smelling chemicals, which is why it reeks of ammonia.'),
("It's painful but rarely serious for healthy people. People with heart problems should stay away.", "It's usually just painful, but it can be serious, especially for kids and people with heart problems, who may not know they have one."),
('In 2018, doctors reported a man who got sudden, severe headaches after eating a Reaper in a pepper contest.', 'In 2018, doctors reported a man who got sudden, severe headaches after eating one in a contest. In 2023, a 14-year-old with a heart defect died after eating a super-hot chip made with Reaper peppers.'),
('In large amounts, about a couple of tablespoons or more, myristicin', 'In large amounts, sometimes as little as a few teaspoons and especially a couple of tablespoons or more, myristicin'),
('Live maggots can cause allergic reactions and stomach problems, but serious cases are rare.', 'Live maggots might cause allergic reactions and stomach problems, but no serious case has been confirmed.'),
('In rare cases, larvae may survive in the gut and cause an infection', 'Possibly, larvae could survive in the gut and cause an infection, though no case has been linked to this cheese'),
("Doctors disagree about how often this really happens, but the risk is why the cheese can't be legally sold in shops.", "Experts worry about these risks, even though cases are not well documented, and the cheese can't be legally sold in shops."),
('Just a handful of raw or soaked-but-uncooked beans can be enough.', 'As few as 4 or 5 raw or undercooked beans can be enough.'),
('then <b>boil them hard for at least 10 minutes</b> before simmering.', 'then <b>boil them hard in fresh water for at least 10 minutes</b> (experts advise 30 to be sure) before simmering.'),
("Be careful with slow cookers: if they never get hot enough to boil, the beans can end up even more toxic than raw ones.", "Don't cook dried beans from raw in a slow cooker: if it never gets hot enough to boil, the beans can end up even more toxic than raw ones."),
('This removes most of the toxin, but not all of it', 'This removes much of the toxin, but not all of it'),
('Small amounts of <b>mercury</b> from the environment end up in the ocean, where tiny creatures absorb it. Small fish eat them, and big fish eat the small fish, so the mercury builds up in large predators. It\'s stored as <b>methylmercury</b>, which can harm the brain and nerves.', 'Small amounts of <b>mercury</b> end up in the ocean, where bacteria turn it into <b>methylmercury</b>. Tiny creatures absorb it, small fish eat them, and big fish eat the small fish, so it builds up in large predators. It can harm the brain and nerves.'),
# 40-31
('so far more of the medicine gets into the blood than it should.', 'so more of many medicines gets into the blood than should. With a few medicines, it does the opposite, and they work less well.'),
('One person became so sick they had to be flown to a hospital by helicopter.', 'Eight people were flown to a hospital by helicopter. The sickest stayed overnight, and everyone recovered.'),
('People usually get sick within a few hours.', 'People can get sick within minutes to a few hours.'),
('Sprouts (the \\"eyes\\") contain a lot too.', 'Sprouts and the \\"eyes\\" contain a lot too.'),
('In rare cases, dizziness or a slow heartbeat', 'Burning and irritation of the lips, tongue, and throat'),
('but most people recover within a day.', 'but most people recover within a day or two.'),
('Most people recover within a day with hospital care', 'Most people recover within a day or two with hospital care'),
("The bees aren't harmed, but the toxin ends up in their honey.", 'Bees carry the toxin back to the hive, and it ends up in their honey.'),
('adults over 40 who eat', 'adults 40 or older who eat'),
('Symptoms can start within hours or take days to appear.', 'Symptoms can start within hours or take days or even weeks to appear.'),
('he discovered that gently heating wine and beer kept germs from spoiling them.', 'he discovered that gently heating wine kept germs from spoiling it.'),
# 30-21
("Choking can kill, but it's rare and can be avoided by chewing well.", "Choking can kill. It's rare, and chewing well lowers the risk."),
('Restaurants cut the octopus into small pieces and coat them in sesame oil, which makes the suckers less sticky. Diners', 'Restaurants cut the octopus into small pieces and season them with sesame oil, but the suckers can still stick. Diners'),
('The Super Mushroom in the Super Mario games is based on the fly agaric. Its name comes from an old practice of soaking the mushroom in milk to attract and kill flies.', 'The Super Mushroom in the Super Mario games looks a lot like the fly agaric. Its name probably comes from an old practice of putting the mushroom in milk to attract and kill flies.'),
('People with healthy kidneys can eat it normally. People with kidney disease', 'People with healthy kidneys can usually eat it in normal amounts, but not huge amounts on an empty stomach. People with kidney disease'),
('Even a small piece can cause severe poisoning, and people have died.', 'Even a small piece can cause severe poisoning, and very large doses of vitamin A can be deadly.'),
('"Skin', '"Skin'),
('On a 1912 expedition to Antarctica, explorers', 'On a 1912-13 sledge journey in Antarctica, explorers'),
('Mertz died, and many experts think vitamin A poisoning was the cause.', 'Mertz died. Some experts think vitamin A poisoning was the cause, while others blame starvation.'),
('adults shouldn\'t eat more than about three small kernels a day, and young children', 'adults shouldn\'t eat more than about three small kernels, or even half of a large one, and young children'),
('weeks or even months', 'weeks, months, or even years'),
('In 1774, on his second voyage around the world, Captain James Cook and some of his crew became sick after eating reef fish in the South Pacific.', "In July 1774, on Captain James Cook's second voyage around the world, some of his crew became sick after eating fresh reef fish near Vanuatu."),
('"Confusion and fever"', '"Confusion and extreme sleepiness"'),
('Telling families to make sure children eat dinner helped stop the outbreaks.', 'Telling families to make sure children eat dinner may have helped, but outbreaks came back, and over 100 children died there in 2019.'),
# 20-11
('But for children under 5, whole grapes can be dangerous.', 'But for children 5 and under, whole grapes can be dangerous.'),
('For children under 5, <b>cut grapes', 'For children 5 and under, <b>cut grapes'),
('warning parents about grape choking, after treating several young children who had choked on whole grapes.', 'warning about grape choking, after three young children choked on whole grapes. Two of them died.'),
('Infections are rare, but about 1 in 5 people who get the worst kind die.', 'Infections are rare, but about 1 in 5 people who get one die.'),
("There's some truth to it, because the bacteria grow fastest in warm summer water.", "The bacteria do grow fastest in warm water, but the rule isn't safe: people get sick in every month of the year."),
("You can't always see or taste the toxin, and cooking doesn't destroy it.", "You can't always see or taste the toxin, and normal cooking doesn't reliably destroy it."),
('And aflatoxin was first discovered in 1960, after', 'And aflatoxin was discovered in the early 1960s, after'),
("Fesikh is made by specialists who are trained in the process. Every year before the festival, Egypt's health officials warn people to buy it only from trusted sellers.", "Some fesikh is made by experts, but families make it too, and fish from shops has caused outbreaks. Every year before the festival, Egypt's health officials warn people about the danger."),
('In 1991, a botulism outbreak in Egypt linked to fesikh sickened dozens of people and killed several, making it one of the largest botulism outbreaks ever recorded.', 'In 1991, a botulism outbreak in Cairo linked to fesikh put 91 people in the hospital and killed 18. It was the largest outbreak of its type reported up to then.'),
("There's no safe way to eat it. To tell it apart from wild garlic, crush a leaf: wild garlic smells strongly of garlic, and lily of the valley doesn't.", "There's no safe way to eat it. Crushing a leaf can help, but a garlic smell left on your hands can fool you. If in doubt, don't eat it."),
('False morels grow in spring in pine forests', 'False morels grow in spring in evergreen forests'),
('Vomiting, diarrhea, and headache, starting 6 to 12 hours later', 'Vomiting, diarrhea, and headache, usually starting 6 to 12 hours later'),
('People there boil them twice in lots of water, throw the water away, and keep windows open.', 'People there boil them twice in lots of water and throw the water away, but some poison still stays in.'),
('and is stuffed with cottony fibers inside.', 'and is not fully hollow, with folded chambers inside.'),
# 10-1
('Guinness World Records has called the castor plant the most poisonous plant in the world.', 'Guinness World Records has called the castor plant the most poisonous common plant in the world.'),
("while wild carrot has a <b>hairy stem</b>.", "while wild carrot has a <b>hairy stem</b>. No blotches doesn't mean it's safe."),
('and executed by drinking a cup of poison hemlock.', 'and executed by drinking a cup of poison, most likely poison hemlock.'),
('Its poison can stop the heart within hours, and it can even soak in through the skin.', 'Its poison can stop the heart within hours, and it can even get in through skin, especially cuts.'),
('It can even soak in through the skin, so gardeners', 'It can even get in through skin, especially cuts, so gardeners'),
("usually in summer and fall. They're pure white,", "usually in summer and fall, but in late winter and spring in California. They're white or nearly white,"),
('which is up to about 1,000 times more poisonous than cyanide.', 'which is far more poisonous than cyanide.'),
('The liver, ovaries, eyes, and skin contain', 'The liver, ovaries, intestines, and skin contain'),
('A breathing machine can keep someone alive until the toxin wears off, usually within a day.', 'A breathing machine can keep someone alive until the toxin wears off, which can take days.'),
('ate four servings of fugu liver at a restaurant, claiming he could handle the poison.', 'reportedly ate four servings of fugu liver at a restaurant, believing he could survive the poison.'),
('within 15 to 60 minutes', 'within 15 to 90 minutes'),
('that smells like raw parsnip.', 'that smells like raw parsnip or turnip.'),
('and about half a cap can kill an adult.', 'and just one mushroom can kill an adult.'),
('People who survived said the mushroom tasted good, so there\'s no warning.', 'Some survivors reportedly said the mushroom tasted good, so taste is no warning.'),
('About half of one mushroom cap can kill an adult. Many survivors need a liver transplant.', 'Just one mushroom can kill an adult. Some survivors need a liver transplant.'),
("The death cap causes about <b>90% of all mushroom poisoning deaths</b> in the world, which is why it's #1", "Death caps and their amatoxin relatives cause about <b>90% of all mushroom poisoning deaths</b> in the world, which is why it's #1"),
]
X = [
('comes from a word for the fruit in Tamil, a language of southern India.', 'comes from a word in the Dravidian languages of southern India, like Tamil.'),
('and many are nearly blind.', 'but a recent study found their eyes can still work.'),
('[72,-40]', '[70,-15]'),
('comes from old French words meaning', 'comes from Medieval Latin and old French words meaning'),
('"Boil dried beans hard for at least 10 minutes."', '"Boil dried beans hard in fresh water for 30 minutes."'),
('that came from Scandinavia.', 'that probably came from Scandinavia.'),
('[37,15]', '[36,17]'),
('It\'s called a grapefruit because the fruits grow in big clusters, like grapes.', "It's probably called a grapefruit because the fruits grow in big clusters, like grapes, but no one is completely sure."),
('but in 1947 a New York court ruled that it counted as a fruit.', 'but in 1947 a US customs court ruled that it counted as a fruit for import taxes.'),
('In 1995, potatoes became the first vegetable grown in space.', 'In 1995, potato plants were grown on a NASA space shuttle. They made tiny potatoes!'),
("Licorice root was found in King Tutankhamun's tomb.", "Many books say licorice root was found in King Tutankhamun's tomb."),
('can be about 50 times sweeter than sugar.', 'can be 30 to 50 times sweeter than sugar.'),
('It is sold more often in parts of Europe and in some US states.', 'It can be bought in parts of Europe and in some US states.'),
('Honey keeps for a very long time. Archaeologists have found ancient honey in Egyptian tombs.', 'Honey keeps for a very long time, often for decades.'),
('"Cut grapes in quarters, lengthwise, for kids under 5."', '"Cut grapes in quarters, lengthwise, for kids 5 and under."'),
('it is also big in Thailand and Indonesia.', 'it is also big in DR Congo and Thailand.'),
('"Peel it well and cook it fully."', '"Peel it, soak it long, and cook it fully. Cooking alone may not be enough."'),
('"Throw away any cassava that tastes very bitter."', '"Bitter cassava is risky, but a mild taste doesn\'t prove it\'s safe."'),
('"Buy only from trusted, licensed sellers."', '"Even shop-bought fesikh can carry botulism."'),
('"Smell the leaves if you pick wild garlic. No garlic smell? Leave it."', '"Garlic smell on your hands can fool a smell test. If in doubt, leave it."'),
('"Never eat one that is raw."', '"Never eat false morels, raw or cooked."'),
('found: "Pine forests in northern Europe', 'found: "Evergreen forests in northern Europe'),
('[50,-3]', '[51,-3]'),
('[20,72]', '[23,72]'),
('"Look for purple blotches on a smooth stem."', '"Purple blotches mean danger, but young plants may barely show them."'),
('[35,-115]', '[37,-122]'),
('[55,15]', '[52,20]'),
('It has a round \\"cap,\\" like all mushrooms,', 'It has a round \\"cap,\\" like many mushrooms,'),
]
def apply(path, pairs):
    s = open(path, encoding="utf-8").read()
    bad = []
    for a, c in pairs:
        if a == c: continue
        n = s.count(a)
        if n != 1: bad.append((n, a[:80]))
        else: s = s.replace(a, c)
    open(path, "w", encoding="utf-8").write(s)
    return bad
for p, pairs in (("entries.js", E), ("extras.js", X)):
    print(p, len(pairs), "problems:", apply(p, pairs))
# Polar bear: no documented human death, so drop that symptom.
s = open("entries.js", encoding="utf-8").read()
a = ', "In severe cases, death"]'
i = s.index('name: "Polar Bear Liver"'); j = s.index(a, i)
assert j - i < 1500
s = s[:j] + "]" + s[j+len(a):]
open("entries.js", "w", encoding="utf-8").write(s)
